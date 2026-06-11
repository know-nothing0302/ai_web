import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  articleChannelStore,
  subscriptionStore,
  wecomTagMappingStore,
} from "../../lib/store";
import {
  type ArticleChannel,
  type SubscriptionFrequency,
  type TagSyncStatus,
  type WecomTagMapping,
} from "../../lib/types";
import { wecomClient } from "../wecom/client";
import { WecomApiError } from "../wecom/errors";

const TAG_BATCH_SIZE = 1000;

const TAG_SYNC_FREQUENCIES: SubscriptionFrequency[] = [
  "daily",
  "instant",
  "weekly",
];

const frequencyLabelMap: Record<SubscriptionFrequency, string> = {
  daily: "每日",
  instant: "即时",
  weekly: "每周",
};

interface EnsureTagMappingInput {
  channelCode: string;
  frequency: SubscriptionFrequency;
}

export interface TagSyncSummary {
  channelCode: string;
  frequency: SubscriptionFrequency;
  tagId: number;
  tagName: string;
  dbUserCount: number;
  remoteUserCount: number;
  addedCount: number;
  removedCount: number;
  invalidUserIds: string[];
  status: TagSyncStatus;
}

export interface TagMemberState {
  channelCode: string;
  frequency: SubscriptionFrequency;
  tagId: number;
  tagName: string;
  dbUserIds: string[];
  remoteUserIds: string[];
  toAddUserIds: string[];
  toRemoveUserIds: string[];
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const uniq = (items: string[]): string[] =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const trimTagName = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length <= 32) {
    return normalized;
  }
  return normalized.slice(0, 32);
};

const buildTagName = (
  channel: ArticleChannel,
  frequency: SubscriptionFrequency
): string => {
  const prefix = env.wecomTagNamePrefix.trim();
  const baseName = `${channel.name}${frequencyLabelMap[frequency]}订阅`;
  return trimTagName(prefix ? `${prefix}-${baseName}` : baseName);
};

const findOrCreateTag = async (
  tagName: string
): Promise<{ tagId: number; tagName: string }> => {
  const existing = await wecomClient.listTags("push");
  const matched = existing.find((item) => item.tagName === tagName);
  if (matched) {
    return matched;
  }
  try {
    return await wecomClient.createTag({ tagName }, "push");
  } catch (error) {
    if (error instanceof WecomApiError && error.errcode === 40071) {
      const tags = await wecomClient.listTags("push");
      const duplicated = tags.find((item) => item.tagName === tagName);
      if (duplicated) {
        return duplicated;
      }
    }
    throw error;
  }
};

const ensureTagMapping = async (
  input: EnsureTagMappingInput
): Promise<WecomTagMapping> => {
  const existing = await wecomTagMappingStore.getByChannelCodeAndFrequency(
    input.channelCode,
    input.frequency
  );
  if (existing?.enabled) {
    return existing;
  }
  const channel = await articleChannelStore.getByCode(input.channelCode);
  if (!channel) {
    throw new Error(`栏目 ${input.channelCode} 不存在，无法创建企微标签`);
  }
  const tagName = buildTagName(channel, input.frequency);
  const tag = await findOrCreateTag(tagName);
  const mapping = await wecomTagMappingStore.upsert({
    channelCode: input.channelCode,
    frequency: input.frequency,
    tagId: tag.tagId,
    tagName: tag.tagName,
    enabled: true,
  });
  logger.info("push.tag.mapping.ready", {
    channelCode: input.channelCode,
    frequency: input.frequency,
    tagId: mapping.tagId,
    tagName: mapping.tagName,
  });
  return mapping;
};

const syncUserDiff = async (
  tagId: number,
  toAdd: string[],
  toRemove: string[]
): Promise<{ invalidUserIds: string[] }> => {
  const invalidUserIds: string[] = [];
  for (const batch of chunk(toAdd, TAG_BATCH_SIZE)) {
    const result = await wecomClient.addTagUsers(tagId, batch, "push");
    invalidUserIds.push(...result.invalidUserIds);
  }
  for (const batch of chunk(toRemove, TAG_BATCH_SIZE)) {
    const result = await wecomClient.removeTagUsers(tagId, batch, "push");
    invalidUserIds.push(...result.invalidUserIds);
  }
  return {
    invalidUserIds: uniq(invalidUserIds),
  };
};

export const tagSyncService = {
  async listMappings(input?: {
    channelCode?: string;
    frequency?: SubscriptionFrequency;
    enabledOnly?: boolean;
  }): Promise<WecomTagMapping[]> {
    return wecomTagMappingStore.list(input);
  },
  async ensureTagMapping(
    input: EnsureTagMappingInput
  ): Promise<WecomTagMapping> {
    return ensureTagMapping(input);
  },
  async getChannelFrequencyTagState(
    input: EnsureTagMappingInput
  ): Promise<TagMemberState> {
    const mapping = await ensureTagMapping(input);
    const subscriptions =
      await subscriptionStore.listEnabledByChannelCodeAndFrequency(
        input.channelCode,
        input.frequency
      );
    const dbUserIds = uniq(subscriptions.map((item) => item.qywxUserId));
    const remoteMembers = await wecomClient.getTagMembers(mapping.tagId, "push");
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
  async syncChannelFrequencyTag(
    input: EnsureTagMappingInput
  ): Promise<TagSyncSummary> {
    const state = await this.getChannelFrequencyTagState(input);
    const mapping = await ensureTagMapping(input);
    logger.info("push.tag.sync.start", {
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
      const { invalidUserIds } = await syncUserDiff(
        mapping.tagId,
        state.toAddUserIds,
        state.toRemoveUserIds
      );
      const status: TagSyncStatus =
        invalidUserIds.length > 0 ? "partial" : "success";
      const syncedAt = new Date().toISOString();
      await wecomTagMappingStore.markSyncResult(mapping.id, {
        status,
        errorMessage:
          invalidUserIds.length > 0
            ? `invalid users: ${invalidUserIds.join(",")}`
            : undefined,
        syncedAt,
      });
      logger.info("push.tag.sync.finish", {
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await wecomTagMappingStore.markSyncResult(mapping.id, {
        status: "failed",
        errorMessage,
      });
      logger.error("push.tag.sync.failed", {
        channelCode: input.channelCode,
        frequency: input.frequency,
        tagId: mapping.tagId,
        error,
      });
      throw error;
    }
  },
  async syncAllChannelTags(): Promise<TagSyncSummary[]> {
    const channels = await articleChannelStore.list(true);
    const results: TagSyncSummary[] = [];
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
