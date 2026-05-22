"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagSyncService = void 0;
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const client_1 = require("../wecom/client");
const errors_1 = require("../wecom/errors");
const TAG_BATCH_SIZE = 1000;
const TAG_SYNC_FREQUENCIES = [
    "daily",
    "instant",
    "weekly",
];
const frequencyLabelMap = {
    daily: "每日",
    instant: "即时",
    weekly: "每周",
};
const chunk = (items, size) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};
const uniq = (items) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
const trimTagName = (value) => {
    const normalized = value.trim();
    if (normalized.length <= 32) {
        return normalized;
    }
    return normalized.slice(0, 32);
};
const buildTagName = (channel, frequency) => {
    const prefix = env_1.env.wecomTagNamePrefix.trim();
    const baseName = `${channel.name}${frequencyLabelMap[frequency]}订阅`;
    return trimTagName(prefix ? `${prefix}-${baseName}` : baseName);
};
const findOrCreateTag = async (tagName) => {
    const existing = await client_1.wecomClient.listTags();
    const matched = existing.find((item) => item.tagName === tagName);
    if (matched) {
        return matched;
    }
    try {
        return await client_1.wecomClient.createTag({ tagName });
    }
    catch (error) {
        if (error instanceof errors_1.WecomApiError && error.errcode === 40071) {
            const tags = await client_1.wecomClient.listTags();
            const duplicated = tags.find((item) => item.tagName === tagName);
            if (duplicated) {
                return duplicated;
            }
        }
        throw error;
    }
};
const ensureTagMapping = async (input) => {
    const existing = await store_1.wecomTagMappingStore.getByChannelCodeAndFrequency(input.channelCode, input.frequency);
    if (existing?.enabled) {
        return existing;
    }
    const channel = await store_1.articleChannelStore.getByCode(input.channelCode);
    if (!channel) {
        throw new Error(`栏目 ${input.channelCode} 不存在，无法创建企微标签`);
    }
    const tagName = buildTagName(channel, input.frequency);
    const tag = await findOrCreateTag(tagName);
    const mapping = await store_1.wecomTagMappingStore.upsert({
        channelCode: input.channelCode,
        frequency: input.frequency,
        tagId: tag.tagId,
        tagName: tag.tagName,
        enabled: true,
    });
    logger_1.logger.info("push.tag.mapping.ready", {
        channelCode: input.channelCode,
        frequency: input.frequency,
        tagId: mapping.tagId,
        tagName: mapping.tagName,
    });
    return mapping;
};
const syncUserDiff = async (tagId, toAdd, toRemove) => {
    const invalidUserIds = [];
    for (const batch of chunk(toAdd, TAG_BATCH_SIZE)) {
        const result = await client_1.wecomClient.addTagUsers(tagId, batch);
        invalidUserIds.push(...result.invalidUserIds);
    }
    for (const batch of chunk(toRemove, TAG_BATCH_SIZE)) {
        const result = await client_1.wecomClient.removeTagUsers(tagId, batch);
        invalidUserIds.push(...result.invalidUserIds);
    }
    return {
        invalidUserIds: uniq(invalidUserIds),
    };
};
exports.tagSyncService = {
    async listMappings(input) {
        return store_1.wecomTagMappingStore.list(input);
    },
    async ensureTagMapping(input) {
        return ensureTagMapping(input);
    },
    async getChannelFrequencyTagState(input) {
        const mapping = await ensureTagMapping(input);
        const subscriptions = await store_1.subscriptionStore.listEnabledByChannelCodeAndFrequency(input.channelCode, input.frequency);
        const dbUserIds = uniq(subscriptions.map((item) => item.qywxUserId));
        const remoteMembers = await client_1.wecomClient.getTagMembers(mapping.tagId);
        const remoteUserIds = uniq(remoteMembers.userIds);
        const remoteUserSet = new Set(remoteUserIds);
        const dbUserSet = new Set(dbUserIds);
        return {
            channelCode: input.channelCode,
            frequency: input.frequency,
            tagId: mapping.tagId,
            tagName: mapping.tagName,
            dbUserIds,
            remoteUserIds,
            toAddUserIds: dbUserIds.filter((item) => !remoteUserSet.has(item)),
            toRemoveUserIds: remoteUserIds.filter((item) => !dbUserSet.has(item)),
        };
    },
    async syncChannelFrequencyTag(input) {
        const state = await this.getChannelFrequencyTagState(input);
        const mapping = await ensureTagMapping(input);
        logger_1.logger.info("push.tag.sync.start", {
            channelCode: input.channelCode,
            frequency: input.frequency,
            tagId: mapping.tagId,
            tagName: mapping.tagName,
            dbUserCount: state.dbUserIds.length,
            remoteUserCount: state.remoteUserIds.length,
            addCount: state.toAddUserIds.length,
            removeCount: state.toRemoveUserIds.length,
        });
        try {
            const { invalidUserIds } = await syncUserDiff(mapping.tagId, state.toAddUserIds, state.toRemoveUserIds);
            const status = invalidUserIds.length > 0 ? "partial" : "success";
            const syncedAt = new Date().toISOString();
            await store_1.wecomTagMappingStore.markSyncResult(mapping.id, {
                status,
                errorMessage: invalidUserIds.length > 0
                    ? `invalid users: ${invalidUserIds.join(",")}`
                    : undefined,
                syncedAt,
            });
            logger_1.logger.info("push.tag.sync.finish", {
                channelCode: input.channelCode,
                frequency: input.frequency,
                tagId: mapping.tagId,
                status,
                invalidUserIds,
            });
            return {
                channelCode: input.channelCode,
                frequency: input.frequency,
                tagId: mapping.tagId,
                tagName: mapping.tagName,
                dbUserCount: state.dbUserIds.length,
                remoteUserCount: state.remoteUserIds.length,
                addedCount: state.toAddUserIds.length,
                removedCount: state.toRemoveUserIds.length,
                invalidUserIds,
                status,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await store_1.wecomTagMappingStore.markSyncResult(mapping.id, {
                status: "failed",
                errorMessage,
            });
            logger_1.logger.error("push.tag.sync.failed", {
                channelCode: input.channelCode,
                frequency: input.frequency,
                tagId: mapping.tagId,
                error,
            });
            throw error;
        }
    },
    async syncAllChannelTags() {
        const channels = await store_1.articleChannelStore.list(true);
        const results = [];
        for (const channel of channels) {
            for (const frequency of TAG_SYNC_FREQUENCIES) {
                const summary = await this.syncChannelFrequencyTag({
                    channelCode: channel.code,
                    frequency,
                });
                results.push(summary);
            }
        }
        return results;
    },
};
