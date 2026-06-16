import { env } from "../../config/env";
import { query } from "../../lib/db";
import { logger } from "../../lib/logger";
import {
  articleStore,
  pushDeliveryStore,
  pushRecordStore,
  recordAnalyticsEventSafely,
  subscriptionStore,
} from "../../lib/store";
import {
  type Article,
  type PushDeliveryMode,
  type Subscription,
  type SubscriptionFrequency,
} from "../../lib/types";
import { wecomClient } from "../wecom/client";
import { WecomApiError, WecomConfigError } from "../wecom/errors";
import { sanitizeWecomMarkdownText } from "./message_sanitizer";
import { tagSyncService } from "./tag_sync_service";

interface PushDeliveryResult {
  recordId: string;
  subscriptionUserId?: string;
  qywxUserId: string;
  deliveryMode: PushDeliveryMode;
  status: "success" | "failed";
  wecomMsgid?: string;
  responseCode?: string;
  errorMessage?: string;
  targetCount?: number;
  invalidUserIds?: string[];
}

interface ChannelPushSummary {
  articleId: string;
  channelCode: string;
  attemptedCount: number;
  successCount: number;
  failedCount: number;
  results: PushDeliveryResult[];
}

interface DigestPushSummary {
  attemptedCount: number;
  successCount: number;
  failedCount: number;
  results: PushDeliveryResult[];
}

interface DigestGroup {
  groupKey: string;
  channelCodes: string[];
  channelNames: string[];
  articles: Article[];
  userIds: string[];
}

interface DigestWindow {
  startAt: string;
  endAt: string;
}

const BATCH_USER_SIZE = 100;
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const frequencyDigestLabelMap: Record<SubscriptionFrequency, string> = {
  daily: "每日速览",
  weekly: "每周速览",
  instant: "早间补发",
};

const buildMessageContext = (input: {
  article: Article;
  title: string;
  summary: string;
}) => {
  const title = sanitizeWecomMarkdownText(input.title);
  const summary = sanitizeWecomMarkdownText(input.summary);
  const url = `${env.webBaseUrl}/articles/${input.article.id}`;
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

const getErrorPayload = (error: unknown): Record<string, unknown> => {
  if (
    error instanceof WecomApiError &&
    error.responseBody &&
    typeof error.responseBody === "object"
  ) {
    return error.responseBody as Record<string, unknown>;
  }
  return {};
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const uniq = (items: string[]): string[] =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const toShiftedChinaDate = (value: Date): Date =>
  new Date(value.getTime() + CHINA_TIME_OFFSET_MS);

const getChinaHour = (value: Date): number => toShiftedChinaDate(value).getUTCHours();

const isWithinInstantPushWindow = (value: Date): boolean => {
  const hour = getChinaHour(value);
  return hour >= env.instantPushWindowStartHour && hour < env.instantPushWindowEndHour;
};

const toIsoString = (value: Date): string => value.toISOString();

const buildRecentWindow = (referenceAt: Date, hours: number): DigestWindow => ({
  startAt: toIsoString(new Date(referenceAt.getTime() - hours * 60 * 60 * 1000)),
  endAt: toIsoString(referenceAt),
});

const buildBeijingDayWindow = (referenceAt: Date, daysBack: number): DigestWindow => {
  const beijingTime = new Date(referenceAt.getTime() + CHINA_TIME_OFFSET_MS);
  const todayStartBeijing = Date.UTC(
    beijingTime.getUTCFullYear(),
    beijingTime.getUTCMonth(),
    beijingTime.getUTCDate()
  );
  const startBeijing = todayStartBeijing - daysBack * 24 * 60 * 60 * 1000;
  const endBeijing = startBeijing + 24 * 60 * 60 * 1000;
  return {
    startAt: toIsoString(new Date(startBeijing - CHINA_TIME_OFFSET_MS)),
    endAt: toIsoString(new Date(endBeijing - CHINA_TIME_OFFSET_MS)),
  };
};

const getArticlePublishedMs = (article: Article): number =>
  new Date(article.publishedAt ?? article.updatedAt ?? article.createdAt).getTime();

const sortArticlesByPublishedDesc = (articles: Article[]): Article[] =>
  [...articles].sort((left, right) => getArticlePublishedMs(right) - getArticlePublishedMs(left));

const getLatestPublishedArticleByChannelCode = async (
  channelCode: string
): Promise<Article | undefined> => {
  const articles = await articleStore.list({ channelCode, status: "published" });
  return sortArticlesByPublishedDesc(articles)[0];
};

const buildDigestMessageContext = (input: {
  frequency: SubscriptionFrequency;
  articles: Article[];
  channelNames: string[];
}) => {
  const label = frequencyDigestLabelMap[input.frequency];
  const articleCount = input.articles.length;
  const channelCount = input.channelNames.length;
  const title = `【${label}】${channelCount}个栏目更新，共${articleCount}篇`;
  const listText = input.articles
    .slice(0, 5)
    .map(
      (item, index) => `${index + 1}.${sanitizeWecomMarkdownText(item.title)}`
    )
    .join("；");
  const suffix = articleCount > 5 ? `；另有 ${articleCount - 5} 篇请到站内查看` : "";
  const summary = sanitizeWecomMarkdownText(
    `${input.channelNames.join("、")}：${listText}${suffix}`
  );
  const url =
    articleCount === 1
      ? `${env.webBaseUrl}/articles/${input.articles[0].id}`
      : `${env.webBaseUrl}/push-digests/today`;
  return {
    title: sanitizeWecomMarkdownText(title),
    summary,
    url,
    sourceDesc: input.frequency === "instant" ? "AI订阅早间补发" : `AI订阅${label}`,
    author: "AI订阅助手",
    items: input.articles.slice(0, 4).map((item) => ({
      title: sanitizeWecomMarkdownText(item.title),
      desc: sanitizeWecomMarkdownText(item.summary),
    })),
  };
};

const sendArticleToSubscription = async (input: {
  article: Article;
  subscription: Subscription;
  title: string;
  summary: string;
  deliveryMode?: PushDeliveryMode;
}): Promise<PushDeliveryResult> => {
  const messageContext = buildMessageContext(input);
  const requestContext = {
    touser: input.subscription.qywxUserId,
    ...messageContext,
  };
  const record = await pushRecordStore.create({
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
    const sendResult = await wecomClient.sendNewsNoticeCard(requestContext, "push");
    await pushRecordStore.markSuccess(record.id, {
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
    await recordAnalyticsEventSafely({
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
    logger.info("push.send.user.success", {
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
  } catch (error) {
    await pushRecordStore.markFailed(record.id, {
      retryCount: error instanceof WecomApiError ? error.attempt - 1 : 0,
      wecomErrcode: error instanceof WecomApiError ? error.errcode : undefined,
      wecomErrmsg:
        error instanceof WecomApiError
          ? error.errmsg
          : error instanceof WecomConfigError
            ? error.message
            : "unknown_error",
      errorDetail: getErrorMessage(error),
      responsePayload: getErrorPayload(error),
    });
    await recordAnalyticsEventSafely({
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
    logger.error("push.send.user.failed", {
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

const sendArticleToTag = async (input: {
  article: Article;
  title: string;
  summary: string;
  tagId: number;
  tagName: string;
}): Promise<PushDeliveryResult> => {
  const messageContext = buildMessageContext(input);
  const requestContext = {
    totag: String(input.tagId),
    ...messageContext,
  };
  const record = await pushRecordStore.create({
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
    const sendResult = await wecomClient.sendNewsNoticeCardToTag({
      tagId: input.tagId,
      ...messageContext,
    }, "push");
    await pushRecordStore.markSuccess(record.id, {
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
    await recordAnalyticsEventSafely({
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
    logger.info("push.send.tag.success", {
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
  } catch (error) {
    await pushRecordStore.markFailed(record.id, {
      retryCount: error instanceof WecomApiError ? error.attempt - 1 : 0,
      wecomErrcode: error instanceof WecomApiError ? error.errcode : undefined,
      wecomErrmsg:
        error instanceof WecomApiError
          ? error.errmsg
          : error instanceof WecomConfigError
            ? error.message
            : "unknown_error",
      errorDetail: getErrorMessage(error),
      responsePayload: getErrorPayload(error),
    });
    await recordAnalyticsEventSafely({
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
    logger.error("push.send.tag.failed", {
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

const sendDigestToUsers = async (input: {
  frequency: SubscriptionFrequency;
  articles: Article[];
  channelCodes: string[];
  channelNames: string[];
  userIds: string[];
}): Promise<DigestPushSummary> => {
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
  const channelCode =
    input.channelCodes.length === 1 ? input.channelCodes[0] : `digest-${input.frequency}`;
  const results: PushDeliveryResult[] = [];
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
    const record = await pushRecordStore.create({
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
      const sendResult = await wecomClient.sendNewsNoticeCardToUsers({
        userIds: userBatch,
        ...messageContext,
      }, "push");
      await pushRecordStore.markSuccess(record.id, {
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
      await recordAnalyticsEventSafely({
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
      logger.info("push.send.batch.success", {
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
    } catch (error) {
      await pushRecordStore.markFailed(record.id, {
        retryCount: error instanceof WecomApiError ? error.attempt - 1 : 0,
        wecomErrcode: error instanceof WecomApiError ? error.errcode : undefined,
        wecomErrmsg:
          error instanceof WecomApiError
            ? error.errmsg
            : error instanceof WecomConfigError
              ? error.message
              : "unknown_error",
        errorDetail: getErrorMessage(error),
        responsePayload: getErrorPayload(error),
      });
      await recordAnalyticsEventSafely({
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
      logger.error("push.send.batch.failed", {
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

const pushArticleToSubscriptions = async (input: {
  article: Article;
  subscriptions: Subscription[];
  title: string;
  summary: string;
  startEvent: string;
  finishEvent: string;
  deliveryMode?: PushDeliveryMode;
}): Promise<ChannelPushSummary> => {
  logger.info(input.startEvent, {
    channelCode: input.article.channelCode,
    articleId: input.article.id,
    targetCount: input.subscriptions.length,
    deliveryMode: input.deliveryMode ?? "user",
  });
  const results: PushDeliveryResult[] = [];
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
  logger.info(input.finishEvent, {
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

const buildDigestGroups = (
  articles: Article[],
  subscriptions: Subscription[]
): DigestGroup[] => {
  const channelsWithArticles = new Set(articles.map((item) => item.channelCode));
  const articlesByChannel = new Map<string, Article[]>();
  for (const article of sortArticlesByPublishedDesc(articles)) {
    const existing = articlesByChannel.get(article.channelCode) ?? [];
    existing.push(article);
    articlesByChannel.set(article.channelCode, existing);
  }
  const groups = new Map<string, DigestGroup>();
  for (const subscription of subscriptions) {
    const channelCodes = subscription.channelCodes
      .filter((item) => channelsWithArticles.has(item))
      .sort((left, right) => left.localeCompare(right));
    if (channelCodes.length === 0) {
      continue;
    }
    const groupKey = channelCodes.join("|");
    if (!groups.has(groupKey)) {
      const groupArticles = sortArticlesByPublishedDesc(
        channelCodes.flatMap((channelCode) => articlesByChannel.get(channelCode) ?? [])
      );
      const channelNames = uniq(
        groupArticles.map((item) => item.channelName?.trim() || item.category.trim() || item.channelCode)
      );
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

const pushDigestByFrequency = async (input: {
  frequency: SubscriptionFrequency;
  articles: Article[];
  startEvent: string;
  finishEvent: string;
}): Promise<number> => {
  if (input.articles.length === 0) {
    logger.info(input.finishEvent, {
      frequency: input.frequency,
      targetCount: 0,
      successCount: 0,
      failedCount: 0,
      groupCount: 0,
    });
    return 0;
  }
  const subscriptions = await subscriptionStore.listEnabledByFrequency(input.frequency);
  const groups = buildDigestGroups(input.articles, subscriptions);
  logger.info(input.startEvent, {
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
  logger.info(input.finishEvent, {
    frequency: input.frequency,
    articleCount: input.articles.length,
    groupCount: groups.length,
    successCount,
    failedCount,
  });
  return successCount;
};

const pushArticleByTagOrFallback = async (input: {
  article: Article;
  subscriptions: Subscription[];
  frequency: SubscriptionFrequency;
  title: string;
  summary: string;
  startEvent: string;
  finishEvent: string;
}): Promise<ChannelPushSummary> => {
  logger.info(input.startEvent, {
    channelCode: input.article.channelCode,
    articleId: input.article.id,
    targetCount: input.subscriptions.length,
    primaryMode: "tag",
  });
  if (input.subscriptions.length === 0) {
    logger.info(input.finishEvent, {
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
    const syncSummary = await tagSyncService.syncChannelFrequencyTag({
      channelCode: input.article.channelCode,
      frequency: input.frequency,
    });
    if (syncSummary.status !== "success") {
      logger.warn("push.send.tag.degrade.partial_sync", {
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
      logger.info(input.finishEvent, {
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
    logger.warn("push.send.tag.degrade.send_failed", {
      channelCode: input.article.channelCode,
      articleId: input.article.id,
      frequency: input.frequency,
      tagId: syncSummary.tagId,
      tagName: syncSummary.tagName,
      errorMessage: tagResult.errorMessage,
    });
  } catch (error) {
    logger.error("push.send.tag.degrade.sync_failed", {
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

export const pushService = {
  async syncAllTags(): Promise<number> {
    const results = await tagSyncService.syncAllChannelTags();
    return results.length;
  },
  async handleArticlePublished(article: Article): Promise<number> {
    if (!article.publishedAt) {
      logger.warn("push.instant.skip.missing_published_at", {
        articleId: article.id,
        channelCode: article.channelCode,
      });
      return 0;
    }
    const publishedAt = new Date(article.publishedAt);
    if (!isWithinInstantPushWindow(publishedAt)) {
      logger.info("push.instant.deferred", {
        articleId: article.id,
        channelCode: article.channelCode,
        publishedAt: article.publishedAt,
      });
      return 0;
    }
    // 去重：检查是否已有该文章的成功推送记录
    const existingRecords = await pushRecordStore.listByArticleId(article.id);
    if (existingRecords.some((r) => r.status === "success")) {
      logger.info("push.instant.skip.already_pushed", {
        articleId: article.id,
        channelCode: article.channelCode,
      });
      return 0;
    }
    const subscriptions = await subscriptionStore.listEnabledByChannelCodeAndFrequency(
      article.channelCode,
      "instant"
    );
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
  async pushInstantByChannelCode(channelCode: string): Promise<number> {
    const latest = await getLatestPublishedArticleByChannelCode(channelCode);
    if (!latest) {
      return 0;
    }
    const subscriptions = await subscriptionStore.listEnabledByChannelCodeAndFrequency(
      channelCode,
      "instant"
    );
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
  async pushDeferredInstantDigest(referenceAt = new Date()): Promise<number> {
    const deferredHours =
      24 - (env.instantPushWindowEndHour - env.instantPushWindowStartHour);
    const window = buildRecentWindow(referenceAt, deferredHours);
    const articles = await articleStore.listPublishedWithin(window);
    return pushDigestByFrequency({
      frequency: "instant",
      articles,
      startEvent: "push.instant.deferred.start",
      finishEvent: "push.instant.deferred.finish",
    });
  },
  async pushDailyDigest(referenceAt = new Date()): Promise<number> {
    const articles = await articleStore.listPublishedByCreatedWindow(
      buildBeijingDayWindow(referenceAt, 1)
    );
    return pushDigestByFrequency({
      frequency: "daily",
      articles,
      startEvent: "push.daily.digest.start",
      finishEvent: "push.daily.digest.finish",
    });
  },
  async pushWeeklyDigest(referenceAt = new Date()): Promise<number> {
    const articles = await articleStore.listPublishedWithin(buildRecentWindow(referenceAt, 24 * 7));
    return pushDigestByFrequency({
      frequency: "weekly",
      articles,
      startEvent: "push.weekly.digest.start",
      finishEvent: "push.weekly.digest.finish",
    });
  },
  async verifyLatestByChannelCode(input: {
    channelCode: string;
    frequency: "daily" | "instant";
    subscriptionUserId?: string;
  }): Promise<ChannelPushSummary> {
    const article = await getLatestPublishedArticleByChannelCode(input.channelCode);
    if (!article) {
      throw new Error(`栏目 ${input.channelCode} 暂无已发布文章`);
    }
    const subscriptions = input.subscriptionUserId
      ? await subscriptionStore
          .getEnabledByChannelCodeAndUserId(
            input.channelCode,
            input.subscriptionUserId,
            input.frequency
          )
          .then((item) => (item ? [item] : []))
      : (await subscriptionStore.listEnabledByChannelCodeAndFrequency(
          input.channelCode,
          input.frequency
        )).slice(0, 1);
    if (subscriptions.length === 0) {
      throw new Error(
        `栏目 ${input.channelCode} 未找到可用于验证的启用订阅，频率=${input.frequency}`
      );
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
  async broadcastArticle(input: { articleId: string; title?: string; summary?: string }): Promise<PushDeliveryResult> {
    const article = await articleStore.getById(input.articleId);
    if (!article) {
      throw new Error(`文章 ${input.articleId} 不存在`);
    }
    const messageContext = buildMessageContext({
      article,
      title: input.title || article.title,
      summary: input.summary || article.summary,
    });
    const record = await pushRecordStore.create({
      articleId: article.id,
      channelCode: article.channelCode,
      qywxUserId: "@all",
      deliveryMode: "broadcast",
      messageType: "template_card.news_notice",
      title: messageContext.title,
      summary: messageContext.summary,
      url: messageContext.url,
      requestPayload: { touser: "@all", ...messageContext },
    });
    try {
      const sendResult = await wecomClient.sendNewsNoticeCardToAll(messageContext, "push");
      await pushRecordStore.markSuccess(record.id, {
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
      await recordAnalyticsEventSafely({
        eventType: "push",
        eventName: "push_sent",
        articleId: article.id,
        channelCode: article.channelCode,
        sourceModule: "push.service",
        eventPayload: {
          recordId: record.id,
          deliveryMode: "broadcast",
        },
      });
      logger.info("push.broadcast.success", {
        recordId: record.id,
        articleId: article.id,
        channelCode: article.channelCode,
        msgid: sendResult.result.msgid,
      });
      return {
        recordId: record.id,
        qywxUserId: "@all",
        deliveryMode: "broadcast",
        status: "success",
        wecomMsgid: sendResult.result.msgid,
        responseCode: sendResult.result.response_code,
      };
    } catch (error) {
      await pushRecordStore.markFailed(record.id, {
        retryCount: error instanceof WecomApiError ? error.attempt - 1 : 0,
        wecomErrcode: error instanceof WecomApiError ? error.errcode : undefined,
        wecomErrmsg:
          error instanceof WecomApiError
            ? error.errmsg
            : error instanceof WecomConfigError
              ? error.message
              : "unknown_error",
        errorDetail: getErrorMessage(error),
        responsePayload: getErrorPayload(error),
      });
      await recordAnalyticsEventSafely({
        eventType: "push",
        eventName: "push_failed",
        articleId: article.id,
        channelCode: article.channelCode,
        sourceModule: "push.service",
        eventPayload: {
          recordId: record.id,
          deliveryMode: "broadcast",
          errorMessage: getErrorMessage(error),
        },
      });
      logger.error("push.broadcast.failed", {
        recordId: record.id,
        articleId: article.id,
        channelCode: article.channelCode,
        error,
      });
      return {
        recordId: record.id,
        qywxUserId: "@all",
        deliveryMode: "broadcast",
        status: "failed",
        errorMessage: getErrorMessage(error),
      };
    }
  },
  async pushTargetedArticle(input: {
    articleId: string;
    targetGroup: "teachers" | "students";
    title?: string;
    summary?: string;
  }): Promise<PushDeliveryResult> {
    const article = await articleStore.getById(input.articleId);
    if (!article) {
      throw new Error(`文章 ${input.articleId} 不存在`);
    }

    // --- 数据源：users 表直查 ---
    const result = await query<{ xh: string }>(
      input.targetGroup === 'teachers'
        ? `SELECT xh FROM users WHERE user_type = 'jzg'`
        : `SELECT xh FROM users WHERE user_type IN ('bks', 'yjs')`
    );
    const allTargetUserIds = result.rows.map(r => r.xh);

    if (allTargetUserIds.length === 0) {
      const targetLabel = input.targetGroup === 'teachers' ? '教师' : '学生';
      throw new Error(`users 表未找到${targetLabel}用户`);
    }

    // --- 去重：已推送 + 已阅读 + 旧订阅教师（过渡期）---
    const alreadyPushed = await pushDeliveryStore.listUserIdsByArticle(article.id);

    const alreadyRead = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM reading_history WHERE article_id = $1`,
      [article.id]
    );
    const alreadyReadIds = alreadyRead.rows.map(r => r.user_id);

    // TODO: 移除——首个过渡期完成后可删
    const oldSubTeachers = input.targetGroup === 'teachers'
      ? await query<{ qywx_user_id: string }>(
          `SELECT qywx_user_id FROM subscriptions WHERE enabled = TRUE AND qywx_user_id LIKE '10000%'`
        ).then(r => r.rows.map(row => row.qywx_user_id))
      : [];

    const excludeSet = new Set([...alreadyPushed, ...alreadyReadIds, ...oldSubTeachers]);
    const targetUserIds = allTargetUserIds.filter(id => !excludeSet.has(id));

    if (targetUserIds.length === 0) {
      const targetLabel = input.targetGroup === 'teachers' ? '教师' : '学生';
      throw new Error(`所有${targetLabel}用户已推送过此文或已阅读，无需重复推送`);
    }

    const targetLabel = input.targetGroup === 'teachers' ? '教师' : '学生';
    const messageContext = buildMessageContext({
      article,
      title: input.title || article.title,
      summary: input.summary || article.summary,
    });

    const record = await pushRecordStore.create({
      articleId: article.id,
      channelCode: article.channelCode,
      qywxUserId: `targeted:${input.targetGroup}`,
      deliveryMode: "batch_user",
      messageType: "template_card.news_notice",
      title: messageContext.title,
      summary: messageContext.summary,
      url: messageContext.url,
      requestPayload: {
        targetGroup: input.targetGroup,
        targetCount: targetUserIds.length,
        ...messageContext,
      },
    });

    try {
      const BATCH_SIZE = 1000;
      const BATCH_DELAY_MS = input.targetGroup === 'students' ? 3000 : 0;
      const userIdBatches = chunk(targetUserIds, BATCH_SIZE);

      let allInvalidUserIds: string[] = [];
      let lastMsgid: string | undefined;
      let lastResponseCode: string | undefined;

      for (let i = 0; i < userIdBatches.length; i++) {
        const batch = userIdBatches[i];
        const sendResult = await wecomClient.sendNewsNoticeCardToUsers(
          {
            userIds: batch,
            ...messageContext,
          },
          "push"
        );
        allInvalidUserIds = allInvalidUserIds.concat(sendResult.invalidUserIds);
        lastMsgid = sendResult.result.msgid;
        lastResponseCode = sendResult.result.response_code;

        // 逐人投递追踪
        const sentUserIds = batch.filter(id => !sendResult.invalidUserIds.includes(id));
        const invalidUserIds = sendResult.invalidUserIds;
        await pushDeliveryStore.insertBatch([
          ...sentUserIds.map(uid => ({
            pushRecordId: record.id,
            articleId: article.id,
            userId: uid,
            status: 'sent' as const,
          })),
          ...invalidUserIds.map(uid => ({
            pushRecordId: record.id,
            articleId: article.id,
            userId: uid,
            status: 'invalid' as const,
          })),
        ]);

        // 学生批间延迟，防止企微 API 限流
        if (BATCH_DELAY_MS > 0 && i < userIdBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      await pushRecordStore.markSuccess(record.id, {
        retryCount: 0,
        wecomErrcode: 0,
        wecomErrmsg: "ok",
        wecomMsgid: lastMsgid,
        responseCode: lastResponseCode,
        responsePayload: {
          batchCount: userIdBatches.length,
          batchSizes: userIdBatches.map((b) => b.length),
          invalidUserIds: allInvalidUserIds,
        },
      });
      await recordAnalyticsEventSafely({
        eventType: "push",
        eventName: "push_sent",
        articleId: article.id,
        channelCode: article.channelCode,
        sourceModule: "push.service",
        eventPayload: {
          recordId: record.id,
          deliveryMode: "batch_user",
          targetGroup: input.targetGroup,
          targetCount: targetUserIds.length,
          batchCount: userIdBatches.length,
          invalidUserIds: allInvalidUserIds,
          totalFromUsers: allTargetUserIds.length,
          excludedAlreadySent: alreadyPushed.length,
          excludedAlreadyRead: alreadyReadIds.length,
        },
      });
      logger.info("push.targeted.success", {
        recordId: record.id,
        articleId: article.id,
        targetGroup: input.targetGroup,
        totalFromUsers: allTargetUserIds.length,
        excludedAlreadySent: alreadyPushed.length,
        excludedAlreadyRead: alreadyReadIds.length,
        finalTargetCount: targetUserIds.length,
        batchCount: userIdBatches.length,
        msgid: lastMsgid,
      });
      return {
        recordId: record.id,
        qywxUserId: `targeted:${input.targetGroup}`,
        deliveryMode: "batch_user",
        status: "success",
        wecomMsgid: lastMsgid,
        responseCode: lastResponseCode,
      };
    } catch (error) {
      await pushRecordStore.markFailed(record.id, {
        retryCount: error instanceof WecomApiError ? error.attempt - 1 : 0,
        wecomErrcode: error instanceof WecomApiError ? error.errcode : undefined,
        wecomErrmsg:
          error instanceof WecomApiError
            ? error.errmsg
            : error instanceof WecomConfigError
              ? error.message
              : "unknown_error",
        errorDetail: getErrorMessage(error),
        responsePayload: getErrorPayload(error),
      });
      await recordAnalyticsEventSafely({
        eventType: "push",
        eventName: "push_failed",
        articleId: article.id,
        channelCode: article.channelCode,
        sourceModule: "push.service",
        eventPayload: {
          recordId: record.id,
          deliveryMode: "batch_user",
          targetGroup: input.targetGroup,
          targetCount: targetUserIds.length,
          errorMessage: getErrorMessage(error),
        },
      });
      logger.error("push.targeted.failed", {
        recordId: record.id,
        articleId: article.id,
        channelCode: article.channelCode,
        targetGroup: input.targetGroup,
        error,
      });
      return {
        recordId: record.id,
        qywxUserId: `targeted:${input.targetGroup}`,
        deliveryMode: "batch_user",
        status: "failed",
        errorMessage: getErrorMessage(error),
      };
    }
  },
};
