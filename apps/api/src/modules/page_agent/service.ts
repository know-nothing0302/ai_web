import axios from "axios";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  articleStore,
  pageAgentConversationStore,
  pageAgentMessageStore,
  recordAnalyticsEventSafely,
  userProfileStore,
} from "../../lib/store";
import { Article } from "../../lib/types";
import { buildPageAgentMessages } from "./prompts";
import { sanitizeForModel, truncateForModel } from "./sanitize";
import {
  PageAgentRequestBody,
  PageAgentResponse,
  PageAgentSource,
} from "./types";

const normalizeAiContent = (content: unknown): string => {
  let normalized = String(content ?? "").trim();
  if (normalized.includes("</think>")) {
    normalized = normalized.split("</think>").slice(-1)[0]?.trim() ?? normalized;
  }
  return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

const shouldSearchSite = (question: string): boolean => {
  const normalized = question.trim();
  return ["还有", "相关文章", "帮我找", "有没有", "类似文章", "最近发布"].some(
    (token) => normalized.includes(token)
  );
};

const buildSearchKeyword = (input: PageAgentRequestBody): string => {
  if (input.selectionText?.trim()) {
    return input.selectionText.trim().slice(0, 60);
  }
  const title =
    typeof input.context.title === "string" && input.context.title.trim()
      ? input.context.title.trim()
      : "";
  if (title) {
    return title.slice(0, 60);
  }
  return input.question.trim().slice(0, 60);
};

const toArticleSource = (article: Article): PageAgentSource => ({
  type: "article",
  articleId: article.id,
  title: article.title,
  url: `/articles/${article.id}`,
  originalUrl: article.originalUrl,
  summary: article.summary,
});

const searchPublishedArticles = async (
  input: PageAgentRequestBody,
  limit: number
): Promise<PageAgentSource[]> => {
  const keyword = buildSearchKeyword(input);
  const channelCode =
    typeof input.context.channelCode === "string" && input.context.channelCode.trim()
      ? input.context.channelCode.trim()
      : undefined;
  const items = await articleStore.list({
    keyword: keyword || undefined,
    channelCode,
    status: "published",
  });
  return items.slice(0, limit).map(toArticleSource);
};

const buildFallbackAnswer = (input: PageAgentRequestBody): string => {
  const selected = input.selectionText?.trim();
  if (selected) {
    return `你当前选中的内容是：${selected}\n\n我已拿到当前页面上下文，但当前未完成大模型回答链路，建议先结合页面正文继续阅读。`;
  }
  if (input.pageType === "article_detail") {
    const title =
      typeof input.context.title === "string" ? input.context.title.trim() : "当前文章";
    const sourceContent =
      typeof input.context.sourceContent === "string"
        ? input.context.sourceContent.trim()
        : "";
    const contentPreview =
      typeof input.context.contentPreview === "string"
        ? input.context.contentPreview.trim()
        : "";
    const summary =
      typeof input.context.summary === "string" ? input.context.summary.trim() : "";
    if (sourceContent) {
      return `${title}涉及的重点内容包括：${sourceContent.slice(0, 300)}${
        sourceContent.length > 300 ? "..." : ""
      }`;
    }
    if (contentPreview) {
      return `${title}的当前正文重点是：${contentPreview}`;
    }
    return summary
      ? `${title}的核心内容是：${summary}`
      : `我已识别当前页面是文章详情页，主题与“${title}”相关。`;
  }
  return `我已识别当前页面为“${input.pageTitle}”，当前可以先基于页面可见内容回答你的问题。`;
};

const previewText = (value: string, maxLength: number): string => {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};

export const answerPageQuestion = async (
  input: PageAgentRequestBody,
  requestUserId?: string
): Promise<PageAgentResponse> => {
  const startedAt = Date.now();
  logger.info("page.agent.answer.enter", {
    conversationId: input.conversationId,
    requestUserId,
    pageType: input.pageType,
    route: input.route,
  });
  const conversation = await pageAgentConversationStore.getById(input.conversationId);
  if (!conversation) {
    logger.warn("page.agent.answer.conversation_missing", {
      conversationId: input.conversationId,
      requestUserId,
    });
    throw new Error("会话不存在或无权限访问");
  }
  if (requestUserId && conversation.userId !== requestUserId) {
    logger.warn("page.agent.answer.conversation_forbidden", {
      conversationId: input.conversationId,
      requestUserId,
      ownerUserId: conversation.userId,
    });
    throw new Error("会话不存在或无权限访问");
  }
  const userId = requestUserId ?? conversation.userId;

  const userProfile = await userProfileStore.getByUserId(userId);
  const historyMessages = (
    await pageAgentMessageStore.listRecentByConversation(input.conversationId, 8)
  )
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({
      ...item,
      sanitizedContent: truncateForModel(item.sanitizedContent ?? item.content, 1200),
    }));
  const sanitizedQuestion = sanitizeForModel(input.question);
  const usedSiteSearch = shouldSearchSite(input.question);
  logger.info("page.agent.answer.start", {
    userId,
    conversationId: input.conversationId,
    pageType: input.pageType,
    route: input.route,
    questionLength: input.question.length,
    hasSelectionText: Boolean(input.selectionText?.trim()),
    historyMessageCount: historyMessages.length,
    usedUserProfile: Boolean(userProfile),
  });

  const currentPageSource: PageAgentSource = {
    type: "current_page",
    title: input.pageTitle || "当前页面",
    url: input.route,
  };
  const searchSources = usedSiteSearch ? await searchPublishedArticles(input, 3) : [];
  logger.info("page.agent.answer.context_loaded", {
    userId,
    conversationId: input.conversationId,
    historyMessageCount: historyMessages.length,
    usedUserProfile: Boolean(userProfile),
    usedSiteSearch,
    searchSourceCount: searchSources.length,
  });
  if (env.pageAgentDebug) {
    logger.debug("page.agent.answer.context_detail", {
      conversationId: input.conversationId,
      historyPreview: historyMessages.map((item) => ({
        role: item.role,
        messageType: item.messageType,
        preview: previewText(item.sanitizedContent ?? item.content, 120),
      })),
      userProfile: userProfile
        ? {
            preferenceSummary: previewText(userProfile.preferenceSummary, 120),
            personaPrompt: previewText(userProfile.personaPrompt, 180),
            interestTopics: userProfile.interestTopics,
          }
        : undefined,
      sanitizedQuestionPreview: previewText(sanitizedQuestion, 120),
      searchSourceTitles: searchSources.map((item) => item.title),
    });
  }

  await pageAgentMessageStore.create({
    conversationId: input.conversationId,
    userId,
    role: "user",
    messageType: "question",
    content: input.question,
    sanitizedContent: sanitizedQuestion,
    pageType: input.pageType,
    route: input.route,
    pageTitle: input.pageTitle,
    contextPayload: input.context,
    sourcesPayload: [],
  });
  await recordAnalyticsEventSafely({
    eventType: "agent",
    eventName: "page_agent_message_created",
    userId,
    pageRoute: input.route,
    pageTitle: input.pageTitle,
    sourceModule: "page_agent.service",
    eventPayload: {
      conversationId: input.conversationId,
      role: "user",
      messageType: "question",
    },
  });

  if (!env.deepseekApiBaseUrl) {
    const answer = buildFallbackAnswer(input);
    await pageAgentMessageStore.create({
      conversationId: input.conversationId,
      userId,
      role: "assistant",
      messageType: "answer",
      content: answer,
      sanitizedContent: answer,
      pageType: input.pageType,
      route: input.route,
      pageTitle: input.pageTitle,
      contextPayload: input.context,
      sourcesPayload: [currentPageSource, ...searchSources],
      model: env.deepseekModel,
    });
    await recordAnalyticsEventSafely({
      eventType: "agent",
      eventName: "page_agent_message_created",
      userId,
      pageRoute: input.route,
      pageTitle: input.pageTitle,
      sourceModule: "page_agent.service",
      eventPayload: {
        conversationId: input.conversationId,
        role: "assistant",
        messageType: "answer",
      },
    });
    await pageAgentConversationStore.touch(input.conversationId);
    logger.warn("page.agent.answer.fallback", {
      userId,
      conversationId: input.conversationId,
      pageType: input.pageType,
      route: input.route,
      usedSiteSearch,
      sourceCount: searchSources.length + 1,
      reason: "missing_deepseek_base_url",
      durationMs: Date.now() - startedAt,
    });
    return {
      conversationId: input.conversationId,
      answer,
      sources: [currentPageSource, ...searchSources],
      meta: {
        usedCurrentPage: true,
        usedSiteSearch,
        usedHistory: historyMessages.length > 0,
        usedUserProfile: Boolean(userProfile),
        model: env.deepseekModel,
      },
    };
  }

  try {
    const messages = buildPageAgentMessages({
      request: {
        ...input,
        question: sanitizedQuestion,
      },
      historyMessages,
      userProfile,
      searchSources,
    });
    if (env.pageAgentDebug) {
      logger.debug("page.agent.answer.prompt_preview", {
        conversationId: input.conversationId,
        messageCount: messages.length,
        promptMessages: messages.map((item) => ({
          role: item.role,
          preview: previewText(item.content, 220),
        })),
      });
    }
    const result = await axios.post(
      `${env.deepseekApiBaseUrl}/v1/chat/completions`,
      {
        model: env.deepseekModel,
        messages,
        temperature: 0.2,
      },
      {
        headers: env.deepseekApiKey
          ? {
              Authorization: `Bearer ${env.deepseekApiKey}`,
            }
          : undefined,
        timeout: 60000,
      }
    );
    const answer = normalizeAiContent(result.data?.choices?.[0]?.message?.content);
    const finalAnswer = answer || buildFallbackAnswer(input);
    if (env.pageAgentDebug) {
      logger.debug("page.agent.answer.model_response", {
        conversationId: input.conversationId,
        rawAnswerPreview: previewText(String(result.data?.choices?.[0]?.message?.content ?? ""), 220),
        finalAnswerPreview: previewText(finalAnswer, 220),
      });
    }
    await pageAgentMessageStore.create({
      conversationId: input.conversationId,
      userId,
      role: "assistant",
      messageType: "answer",
      content: finalAnswer,
      sanitizedContent: finalAnswer,
      pageType: input.pageType,
      route: input.route,
      pageTitle: input.pageTitle,
      contextPayload: input.context,
      sourcesPayload: [currentPageSource, ...searchSources],
      model: env.deepseekModel,
    });
    await recordAnalyticsEventSafely({
      eventType: "agent",
      eventName: "page_agent_message_created",
      userId,
      pageRoute: input.route,
      pageTitle: input.pageTitle,
      sourceModule: "page_agent.service",
      eventPayload: {
        conversationId: input.conversationId,
        role: "assistant",
        messageType: "answer",
      },
    });
    await pageAgentConversationStore.touch(input.conversationId);
    logger.info("page.agent.answer.finish", {
      userId,
      conversationId: input.conversationId,
      pageType: input.pageType,
      route: input.route,
      usedSiteSearch,
      sourceCount: searchSources.length + 1,
      model: env.deepseekModel,
      durationMs: Date.now() - startedAt,
    });
    return {
      conversationId: input.conversationId,
      answer: finalAnswer,
      sources: [currentPageSource, ...searchSources],
      meta: {
        usedCurrentPage: true,
        usedSiteSearch,
        usedHistory: historyMessages.length > 0,
        usedUserProfile: Boolean(userProfile),
        model: env.deepseekModel,
      },
    };
  } catch (error) {
    const answer = buildFallbackAnswer(input);
    await pageAgentMessageStore.create({
      conversationId: input.conversationId,
      userId,
      role: "assistant",
      messageType: "answer",
      content: answer,
      sanitizedContent: answer,
      pageType: input.pageType,
      route: input.route,
      pageTitle: input.pageTitle,
      contextPayload: input.context,
      sourcesPayload: [currentPageSource, ...searchSources],
      model: env.deepseekModel,
    });
    await recordAnalyticsEventSafely({
      eventType: "agent",
      eventName: "page_agent_message_created",
      userId,
      pageRoute: input.route,
      pageTitle: input.pageTitle,
      sourceModule: "page_agent.service",
      eventPayload: {
        conversationId: input.conversationId,
        role: "assistant",
        messageType: "answer",
      },
    });
    await pageAgentConversationStore.touch(input.conversationId);
    logger.error("page.agent.answer.failed", {
      userId,
      conversationId: input.conversationId,
      pageType: input.pageType,
      route: input.route,
      usedSiteSearch,
      error,
      durationMs: Date.now() - startedAt,
    });
    return {
      conversationId: input.conversationId,
      answer,
      sources: [currentPageSource, ...searchSources],
      meta: {
        usedCurrentPage: true,
        usedSiteSearch,
        usedHistory: historyMessages.length > 0,
        usedUserProfile: Boolean(userProfile),
        model: env.deepseekModel,
      },
    };
  }
};
