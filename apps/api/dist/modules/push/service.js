"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushService = void 0;
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const client_1 = require("../wecom/client");
const errors_1 = require("../wecom/errors");
const message_sanitizer_1 = require("./message_sanitizer");
const tag_sync_service_1 = require("./tag_sync_service");
const BATCH_USER_SIZE = 100;
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const frequencyDigestLabelMap = {
    daily: "每日速览",
    weekly: "每周速览",
    instant: "早间补发",
};
const buildMessageContext = (input) => {
    const title = (0, message_sanitizer_1.sanitizeWecomMarkdownText)(input.title);
    const summary = (0, message_sanitizer_1.sanitizeWecomMarkdownText)(input.summary);
    const url = `${env_1.env.webBaseUrl}/articles/${input.article.id}`;
    return {
        title,
        summary,
        url,
        sourceDesc: input.article.channelName ?? input.article.category,
        author: input.article.author,
        items: [
            {
                title,
                desc: summary,
            },
        ],
    };
};
const getErrorPayload = (error) => {
    if (error instanceof errors_1.WecomApiError &&
        error.responseBody &&
        typeof error.responseBody === "object") {
        return error.responseBody;
    }
    return {};
};
const getErrorMessage = (error) => error instanceof Error ? error.message : String(error);
const chunk = (items, size) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};
const uniq = (items) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
const toShiftedChinaDate = (value) => new Date(value.getTime() + CHINA_TIME_OFFSET_MS);
const getChinaHour = (value) => toShiftedChinaDate(value).getUTCHours();
const isWithinInstantPushWindow = (value) => {
    const hour = getChinaHour(value);
    return hour >= env_1.env.instantPushWindowStartHour && hour < env_1.env.instantPushWindowEndHour;
};
const toIsoString = (value) => value.toISOString();
const buildRecentWindow = (referenceAt, hours) => ({
    startAt: toIsoString(new Date(referenceAt.getTime() - hours * 60 * 60 * 1000)),
    endAt: toIsoString(referenceAt),
});
const getArticlePublishedMs = (article) => new Date(article.publishedAt ?? article.updatedAt ?? article.createdAt).getTime();
const sortArticlesByPublishedDesc = (articles) => [...articles].sort((left, right) => getArticlePublishedMs(right) - getArticlePublishedMs(left));
const getLatestPublishedArticleByChannelCode = async (channelCode) => {
    const articles = await store_1.articleStore.list({ channelCode, status: "published" });
    return sortArticlesByPublishedDesc(articles)[0];
};
const buildDigestMessageContext = (input) => {
    const label = frequencyDigestLabelMap[input.frequency];
    const articleCount = input.articles.length;
    const channelCount = input.channelNames.length;
    const title = `【${label}】${channelCount}个栏目更新，共${articleCount}篇`;
    const listText = input.articles
        .slice(0, 5)
        .map((item, index) => `${index + 1}.${(0, message_sanitizer_1.sanitizeWecomMarkdownText)(item.title)}`)
        .join("；");
    const suffix = articleCount > 5 ? `；另有 ${articleCount - 5} 篇请到站内查看` : "";
    const summary = (0, message_sanitizer_1.sanitizeWecomMarkdownText)(`${input.channelNames.join("、")}：${listText}${suffix}`);
    const url = articleCount === 1
        ? `${env_1.env.webBaseUrl}/articles/${input.articles[0].id}`
        : `${env_1.env.webBaseUrl}/push-digests/today`;
    return {
        title: (0, message_sanitizer_1.sanitizeWecomMarkdownText)(title),
        summary,
        url,
        sourceDesc: input.frequency === "instant" ? "AI订阅早间补发" : `AI订阅${label}`,
        author: "AI订阅助手",
        items: input.articles.slice(0, 4).map((item) => ({
            title: (0, message_sanitizer_1.sanitizeWecomMarkdownText)(item.title),
            desc: (0, message_sanitizer_1.sanitizeWecomMarkdownText)(item.summary),
        })),
    };
};
const sendArticleToSubscription = async (input) => {
    const messageContext = buildMessageContext(input);
    const requestContext = {
        touser: input.subscription.qywxUserId,
        ...messageContext,
    };
    const record = await store_1.pushRecordStore.create({
        articleId: input.article.id,
        channelCode: input.article.channelCode,
        subscriptionUserId: input.subscription.userId,
        qywxUserId: input.subscription.qywxUserId,
        deliveryMode: input.deliveryMode ?? "user",
        messageType: "template_card.news_notice",
        title: messageContext.title,
        summary: messageContext.summary,
        url: messageContext.url,
        requestPayload: requestContext,
    });
    try {
        const sendResult = await client_1.wecomClient.sendNewsNoticeCard(requestContext);
        await store_1.pushRecordStore.markSuccess(record.id, {
            retryCount: sendResult.attempt - 1,
            wecomErrcode: sendResult.result.errcode,
            wecomErrmsg: sendResult.result.errmsg,
            wecomMsgid: sendResult.result.msgid,
            responseCode: sendResult.result.response_code,
            responsePayload: {
                request: sendResult.payload,
                response: sendResult.result,
            },
        });
        await (0, store_1.recordAnalyticsEventSafely)({
            eventType: "push",
            eventName: "push_sent",
            userId: input.subscription.userId,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            sourceModule: "push.service",
            eventPayload: {
                recordId: record.id,
                deliveryMode: input.deliveryMode ?? "user",
            },
        });
        logger_1.logger.info("push.send.user.success", {
            recordId: record.id,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            qywxUserId: input.subscription.qywxUserId,
            deliveryMode: input.deliveryMode ?? "user",
            msgid: sendResult.result.msgid,
        });
        return {
            recordId: record.id,
            subscriptionUserId: input.subscription.userId,
            qywxUserId: input.subscription.qywxUserId,
            deliveryMode: input.deliveryMode ?? "user",
            status: "success",
            wecomMsgid: sendResult.result.msgid,
            responseCode: sendResult.result.response_code,
        };
    }
    catch (error) {
        await store_1.pushRecordStore.markFailed(record.id, {
            retryCount: error instanceof errors_1.WecomApiError ? error.attempt - 1 : 0,
            wecomErrcode: error instanceof errors_1.WecomApiError ? error.errcode : undefined,
            wecomErrmsg: error instanceof errors_1.WecomApiError
                ? error.errmsg
                : error instanceof errors_1.WecomConfigError
                    ? error.message
                    : "unknown_error",
            errorDetail: getErrorMessage(error),
            responsePayload: getErrorPayload(error),
        });
        await (0, store_1.recordAnalyticsEventSafely)({
            eventType: "push",
            eventName: "push_failed",
            userId: input.subscription.userId,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            sourceModule: "push.service",
            eventPayload: {
                recordId: record.id,
                deliveryMode: input.deliveryMode ?? "user",
                errorMessage: getErrorMessage(error),
            },
        });
        logger_1.logger.error("push.send.user.failed", {
            recordId: record.id,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            qywxUserId: input.subscription.qywxUserId,
            deliveryMode: input.deliveryMode ?? "user",
            error,
        });
        return {
            recordId: record.id,
            subscriptionUserId: input.subscription.userId,
            qywxUserId: input.subscription.qywxUserId,
            deliveryMode: input.deliveryMode ?? "user",
            status: "failed",
            errorMessage: getErrorMessage(error),
        };
    }
};
const sendArticleToTag = async (input) => {
    const messageContext = buildMessageContext(input);
    const requestContext = {
        totag: String(input.tagId),
        ...messageContext,
    };
    const record = await store_1.pushRecordStore.create({
        articleId: input.article.id,
        channelCode: input.article.channelCode,
        qywxUserId: `tag:${input.tagId}`,
        deliveryMode: "tag",
        wecomTagId: input.tagId,
        wecomTagName: input.tagName,
        messageType: "template_card.news_notice",
        title: messageContext.title,
        summary: messageContext.summary,
        url: messageContext.url,
        requestPayload: requestContext,
    });
    try {
        const sendResult = await client_1.wecomClient.sendNewsNoticeCardToTag({
            tagId: input.tagId,
            ...messageContext,
        });
        await store_1.pushRecordStore.markSuccess(record.id, {
            retryCount: sendResult.attempt - 1,
            wecomErrcode: sendResult.result.errcode,
            wecomErrmsg: sendResult.result.errmsg,
            wecomMsgid: sendResult.result.msgid,
            responseCode: sendResult.result.response_code,
            responsePayload: {
                request: sendResult.payload,
                response: sendResult.result,
            },
        });
        await (0, store_1.recordAnalyticsEventSafely)({
            eventType: "push",
            eventName: "push_sent",
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            sourceModule: "push.service",
            eventPayload: {
                recordId: record.id,
                deliveryMode: "tag",
                tagId: input.tagId,
                tagName: input.tagName,
            },
        });
        logger_1.logger.info("push.send.tag.success", {
            recordId: record.id,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            tagId: input.tagId,
            tagName: input.tagName,
            msgid: sendResult.result.msgid,
        });
        return {
            recordId: record.id,
            qywxUserId: `tag:${input.tagId}`,
            deliveryMode: "tag",
            status: "success",
            wecomMsgid: sendResult.result.msgid,
            responseCode: sendResult.result.response_code,
        };
    }
    catch (error) {
        await store_1.pushRecordStore.markFailed(record.id, {
            retryCount: error instanceof errors_1.WecomApiError ? error.attempt - 1 : 0,
            wecomErrcode: error instanceof errors_1.WecomApiError ? error.errcode : undefined,
            wecomErrmsg: error instanceof errors_1.WecomApiError
                ? error.errmsg
                : error instanceof errors_1.WecomConfigError
                    ? error.message
                    : "unknown_error",
            errorDetail: getErrorMessage(error),
            responsePayload: getErrorPayload(error),
        });
        await (0, store_1.recordAnalyticsEventSafely)({
            eventType: "push",
            eventName: "push_failed",
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            sourceModule: "push.service",
            eventPayload: {
                recordId: record.id,
                deliveryMode: "tag",
                tagId: input.tagId,
                tagName: input.tagName,
                errorMessage: getErrorMessage(error),
            },
        });
        logger_1.logger.error("push.send.tag.failed", {
            recordId: record.id,
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            tagId: input.tagId,
            tagName: input.tagName,
            error,
        });
        return {
            recordId: record.id,
            qywxUserId: `tag:${input.tagId}`,
            deliveryMode: "tag",
            status: "failed",
            errorMessage: getErrorMessage(error),
        };
    }
};
const sendDigestToUsers = async (input) => {
    if (input.userIds.length === 0 || input.articles.length === 0) {
        return {
            attemptedCount: 0,
            successCount: 0,
            failedCount: 0,
            results: [],
        };
    }
    const messageContext = buildDigestMessageContext({
        frequency: input.frequency,
        articles: input.articles,
        channelNames: input.channelNames,
    });
    const articleId = input.articles[0]?.id;
    const channelCode = input.channelCodes.length === 1 ? input.channelCodes[0] : `digest-${input.frequency}`;
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    for (const userBatch of chunk(input.userIds, BATCH_USER_SIZE)) {
        const requestContext = {
            touser: userBatch,
            articleIds: input.articles.map((item) => item.id),
            channelCodes: input.channelCodes,
            frequency: input.frequency,
            ...messageContext,
        };
        const record = await store_1.pushRecordStore.create({
            articleId,
            channelCode,
            qywxUserId: `batch:${userBatch.length}`,
            deliveryMode: "batch_user",
            messageType: "template_card.news_notice",
            title: messageContext.title,
            summary: messageContext.summary,
            url: messageContext.url,
            requestPayload: requestContext,
        });
        try {
            const sendResult = await client_1.wecomClient.sendNewsNoticeCardToUsers({
                userIds: userBatch,
                ...messageContext,
            });
            await store_1.pushRecordStore.markSuccess(record.id, {
                retryCount: sendResult.attempt - 1,
                wecomErrcode: sendResult.result.errcode,
                wecomErrmsg: sendResult.result.errmsg,
                wecomMsgid: sendResult.result.msgid,
                responseCode: sendResult.result.response_code,
                responsePayload: {
                    request: sendResult.payload,
                    response: sendResult.result,
                    invalidUserIds: sendResult.invalidUserIds,
                },
            });
            await (0, store_1.recordAnalyticsEventSafely)({
                eventType: "push",
                eventName: "push_sent",
                articleId,
                channelCode,
                sourceModule: "push.service",
                eventPayload: {
                    recordId: record.id,
                    deliveryMode: "batch_user",
                    frequency: input.frequency,
                    targetCount: userBatch.length,
                    invalidUserIds: sendResult.invalidUserIds,
                },
            });
            const invalidCount = sendResult.invalidUserIds.length;
            successCount += Math.max(userBatch.length - invalidCount, 0);
            failedCount += invalidCount;
            logger_1.logger.info("push.send.batch.success", {
                recordId: record.id,
                frequency: input.frequency,
                channelCodes: input.channelCodes,
                targetCount: userBatch.length,
                invalidUserIds: sendResult.invalidUserIds,
                msgid: sendResult.result.msgid,
            });
            results.push({
                recordId: record.id,
                qywxUserId: `batch:${userBatch.length}`,
                deliveryMode: "batch_user",
                status: "success",
                wecomMsgid: sendResult.result.msgid,
                responseCode: sendResult.result.response_code,
                targetCount: userBatch.length,
                invalidUserIds: sendResult.invalidUserIds,
            });
        }
        catch (error) {
            await store_1.pushRecordStore.markFailed(record.id, {
                retryCount: error instanceof errors_1.WecomApiError ? error.attempt - 1 : 0,
                wecomErrcode: error instanceof errors_1.WecomApiError ? error.errcode : undefined,
                wecomErrmsg: error instanceof errors_1.WecomApiError
                    ? error.errmsg
                    : error instanceof errors_1.WecomConfigError
                        ? error.message
                        : "unknown_error",
                errorDetail: getErrorMessage(error),
                responsePayload: getErrorPayload(error),
            });
            await (0, store_1.recordAnalyticsEventSafely)({
                eventType: "push",
                eventName: "push_failed",
                articleId,
                channelCode,
                sourceModule: "push.service",
                eventPayload: {
                    recordId: record.id,
                    deliveryMode: "batch_user",
                    frequency: input.frequency,
                    targetCount: userBatch.length,
                    errorMessage: getErrorMessage(error),
                },
            });
            failedCount += userBatch.length;
            logger_1.logger.error("push.send.batch.failed", {
                recordId: record.id,
                frequency: input.frequency,
                channelCodes: input.channelCodes,
                targetCount: userBatch.length,
                error,
            });
            results.push({
                recordId: record.id,
                qywxUserId: `batch:${userBatch.length}`,
                deliveryMode: "batch_user",
                status: "failed",
                errorMessage: getErrorMessage(error),
                targetCount: userBatch.length,
            });
        }
    }
    return {
        attemptedCount: input.userIds.length,
        successCount,
        failedCount,
        results,
    };
};
const pushArticleToSubscriptions = async (input) => {
    logger_1.logger.info(input.startEvent, {
        channelCode: input.article.channelCode,
        articleId: input.article.id,
        targetCount: input.subscriptions.length,
        deliveryMode: input.deliveryMode ?? "user",
    });
    const results = [];
    for (const subscription of input.subscriptions) {
        const result = await sendArticleToSubscription({
            article: input.article,
            subscription,
            title: input.title,
            summary: input.summary,
            deliveryMode: input.deliveryMode,
        });
        results.push(result);
    }
    const successCount = results.filter((item) => item.status === "success").length;
    const failedCount = results.length - successCount;
    logger_1.logger.info(input.finishEvent, {
        channelCode: input.article.channelCode,
        articleId: input.article.id,
        targetCount: input.subscriptions.length,
        successCount,
        failedCount,
        deliveryMode: input.deliveryMode ?? "user",
    });
    return {
        articleId: input.article.id,
        channelCode: input.article.channelCode,
        attemptedCount: input.subscriptions.length,
        successCount,
        failedCount,
        results,
    };
};
const buildDigestGroups = (articles, subscriptions) => {
    const channelsWithArticles = new Set(articles.map((item) => item.channelCode));
    const articlesByChannel = new Map();
    for (const article of sortArticlesByPublishedDesc(articles)) {
        const existing = articlesByChannel.get(article.channelCode) ?? [];
        existing.push(article);
        articlesByChannel.set(article.channelCode, existing);
    }
    const groups = new Map();
    for (const subscription of subscriptions) {
        const channelCodes = subscription.channelCodes
            .filter((item) => channelsWithArticles.has(item))
            .sort((left, right) => left.localeCompare(right));
        if (channelCodes.length === 0) {
            continue;
        }
        const groupKey = channelCodes.join("|");
        if (!groups.has(groupKey)) {
            const groupArticles = sortArticlesByPublishedDesc(channelCodes.flatMap((channelCode) => articlesByChannel.get(channelCode) ?? []));
            const channelNames = uniq(groupArticles.map((item) => item.channelName?.trim() || item.category.trim() || item.channelCode));
            groups.set(groupKey, {
                groupKey,
                channelCodes,
                channelNames,
                articles: groupArticles,
                userIds: [],
            });
        }
        const group = groups.get(groupKey);
        if (group) {
            group.userIds.push(subscription.qywxUserId);
        }
    }
    return [...groups.values()].map((group) => ({
        ...group,
        userIds: uniq(group.userIds),
    }));
};
const pushDigestByFrequency = async (input) => {
    if (input.articles.length === 0) {
        logger_1.logger.info(input.finishEvent, {
            frequency: input.frequency,
            targetCount: 0,
            successCount: 0,
            failedCount: 0,
            groupCount: 0,
        });
        return 0;
    }
    const subscriptions = await store_1.subscriptionStore.listEnabledByFrequency(input.frequency);
    const groups = buildDigestGroups(input.articles, subscriptions);
    logger_1.logger.info(input.startEvent, {
        frequency: input.frequency,
        articleCount: input.articles.length,
        subscriptionCount: subscriptions.length,
        groupCount: groups.length,
    });
    let successCount = 0;
    let failedCount = 0;
    for (const group of groups) {
        const summary = await sendDigestToUsers({
            frequency: input.frequency,
            articles: group.articles,
            channelCodes: group.channelCodes,
            channelNames: group.channelNames,
            userIds: group.userIds,
        });
        successCount += summary.successCount;
        failedCount += summary.failedCount;
    }
    logger_1.logger.info(input.finishEvent, {
        frequency: input.frequency,
        articleCount: input.articles.length,
        groupCount: groups.length,
        successCount,
        failedCount,
    });
    return successCount;
};
const pushArticleByTagOrFallback = async (input) => {
    logger_1.logger.info(input.startEvent, {
        channelCode: input.article.channelCode,
        articleId: input.article.id,
        targetCount: input.subscriptions.length,
        primaryMode: "tag",
    });
    if (input.subscriptions.length === 0) {
        logger_1.logger.info(input.finishEvent, {
            channelCode: input.article.channelCode,
            articleId: input.article.id,
            targetCount: 0,
            successCount: 0,
            failedCount: 0,
            deliveryMode: "tag",
        });
        return {
            articleId: input.article.id,
            channelCode: input.article.channelCode,
            attemptedCount: 0,
            successCount: 0,
            failedCount: 0,
            results: [],
        };
    }
    try {
        const syncSummary = await tag_sync_service_1.tagSyncService.syncChannelFrequencyTag({
            channelCode: input.article.channelCode,
            frequency: input.frequency,
        });
        if (syncSummary.status !== "success") {
            logger_1.logger.warn("push.send.tag.degrade.partial_sync", {
                channelCode: input.article.channelCode,
                articleId: input.article.id,
                frequency: input.frequency,
                tagId: syncSummary.tagId,
                tagName: syncSummary.tagName,
                syncStatus: syncSummary.status,
                invalidUserIds: syncSummary.invalidUserIds,
            });
            return pushArticleToSubscriptions({
                article: input.article,
                subscriptions: input.subscriptions,
                title: input.title,
                summary: input.summary,
                startEvent: `${input.startEvent}.fallback`,
                finishEvent: `${input.finishEvent}.fallback`,
                deliveryMode: "fallback_user",
            });
        }
        const tagResult = await sendArticleToTag({
            article: input.article,
            title: input.title,
            summary: input.summary,
            tagId: syncSummary.tagId,
            tagName: syncSummary.tagName,
        });
        if (tagResult.status === "success") {
            logger_1.logger.info(input.finishEvent, {
                channelCode: input.article.channelCode,
                articleId: input.article.id,
                targetCount: input.subscriptions.length,
                successCount: input.subscriptions.length,
                failedCount: 0,
                deliveryMode: "tag",
                tagId: syncSummary.tagId,
            });
            return {
                articleId: input.article.id,
                channelCode: input.article.channelCode,
                attemptedCount: input.subscriptions.length,
                successCount: input.subscriptions.length,
                failedCount: 0,
                results: [tagResult],
            };
        }
        logger_1.logger.warn("push.send.tag.degrade.send_failed", {
            channelCode: input.article.channelCode,
            articleId: input.article.id,
            frequency: input.frequency,
            tagId: syncSummary.tagId,
            tagName: syncSummary.tagName,
            errorMessage: tagResult.errorMessage,
        });
    }
    catch (error) {
        logger_1.logger.error("push.send.tag.degrade.sync_failed", {
            channelCode: input.article.channelCode,
            articleId: input.article.id,
            frequency: input.frequency,
            error,
        });
    }
    return pushArticleToSubscriptions({
        article: input.article,
        subscriptions: input.subscriptions,
        title: input.title,
        summary: input.summary,
        startEvent: `${input.startEvent}.fallback`,
        finishEvent: `${input.finishEvent}.fallback`,
        deliveryMode: "fallback_user",
    });
};
exports.pushService = {
    async syncAllTags() {
        const results = await tag_sync_service_1.tagSyncService.syncAllChannelTags();
        return results.length;
    },
    async handleArticlePublished(article) {
        if (!article.publishedAt) {
            logger_1.logger.warn("push.instant.skip.missing_published_at", {
                articleId: article.id,
                channelCode: article.channelCode,
            });
            return 0;
        }
        const publishedAt = new Date(article.publishedAt);
        if (!isWithinInstantPushWindow(publishedAt)) {
            logger_1.logger.info("push.instant.deferred", {
                articleId: article.id,
                channelCode: article.channelCode,
                publishedAt: article.publishedAt,
            });
            return 0;
        }
        const subscriptions = await store_1.subscriptionStore.listEnabledByChannelCodeAndFrequency(article.channelCode, "instant");
        const summary = await pushArticleByTagOrFallback({
            article,
            subscriptions,
            frequency: "instant",
            title: article.title,
            summary: article.summary,
            startEvent: "push.instant.publish.start",
            finishEvent: "push.instant.publish.finish",
        });
        return summary.successCount;
    },
    async pushInstantByChannelCode(channelCode) {
        const latest = await getLatestPublishedArticleByChannelCode(channelCode);
        if (!latest) {
            return 0;
        }
        const subscriptions = await store_1.subscriptionStore.listEnabledByChannelCodeAndFrequency(channelCode, "instant");
        const summary = await pushArticleByTagOrFallback({
            article: latest,
            subscriptions,
            frequency: "instant",
            title: latest.title,
            summary: latest.summary,
            startEvent: "push.instant.start",
            finishEvent: "push.instant.finish",
        });
        return summary.successCount;
    },
    async pushDeferredInstantDigest(referenceAt = new Date()) {
        const deferredHours = 24 - (env_1.env.instantPushWindowEndHour - env_1.env.instantPushWindowStartHour);
        const window = buildRecentWindow(referenceAt, deferredHours);
        const articles = await store_1.articleStore.listPublishedWithin(window);
        return pushDigestByFrequency({
            frequency: "instant",
            articles,
            startEvent: "push.instant.deferred.start",
            finishEvent: "push.instant.deferred.finish",
        });
    },
    async pushDailyDigest(referenceAt = new Date()) {
        const articles = await store_1.articleStore.listPublishedWithin(buildRecentWindow(referenceAt, 24));
        return pushDigestByFrequency({
            frequency: "daily",
            articles,
            startEvent: "push.daily.digest.start",
            finishEvent: "push.daily.digest.finish",
        });
    },
    async pushWeeklyDigest(referenceAt = new Date()) {
        const articles = await store_1.articleStore.listPublishedWithin(buildRecentWindow(referenceAt, 24 * 7));
        return pushDigestByFrequency({
            frequency: "weekly",
            articles,
            startEvent: "push.weekly.digest.start",
            finishEvent: "push.weekly.digest.finish",
        });
    },
    async verifyLatestByChannelCode(input) {
        const article = await getLatestPublishedArticleByChannelCode(input.channelCode);
        if (!article) {
            throw new Error(`栏目 ${input.channelCode} 暂无已发布文章`);
        }
        const subscriptions = input.subscriptionUserId
            ? await store_1.subscriptionStore
                .getEnabledByChannelCodeAndUserId(input.channelCode, input.subscriptionUserId, input.frequency)
                .then((item) => (item ? [item] : []))
            : (await store_1.subscriptionStore.listEnabledByChannelCodeAndFrequency(input.channelCode, input.frequency)).slice(0, 1);
        if (subscriptions.length === 0) {
            throw new Error(`栏目 ${input.channelCode} 未找到可用于验证的启用订阅，频率=${input.frequency}`);
        }
        return pushArticleToSubscriptions({
            article,
            subscriptions,
            title: input.frequency === "daily" ? `【每日资讯】${article.title}` : article.title,
            summary: article.summary,
            startEvent: "push.verify.channel.start",
            finishEvent: "push.verify.channel.finish",
            deliveryMode: "user",
        });
    },
};
