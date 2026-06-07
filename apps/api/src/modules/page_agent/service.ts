import axios, { AxiosResponse } from "axios";
import { Response } from "express";
import { Stream } from "stream";

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

  // DeepSeek R1/V4 推理模型使用 <｜end▁of▁thinking｜> 标记分隔思考与回答
  if (normalized.includes("<｜end▁of▁thinking｜>")) {
    normalized = normalized.split(" response").slice(-1)[0]?.trim() ?? normalized;
  }
  // 移除所有  ...  块（如果 response 分割后仍有残留）
  normalized = normalized.replace(/[\s\S]*?<\/think>/g, "").trim();

  // 传统 <think>...</think> 标签
  if (normalized.includes("</think>")) {
    normalized = normalized.split("</think>").slice(-1)[0]?.trim() ?? normalized;
  }
  normalized = normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  return normalized;
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
    const sanitizedSelectionText = input.selectionText?.trim()
      ? sanitizeForModel(input.selectionText.trim())
      : undefined;
    const messages = buildPageAgentMessages({
      request: {
        ...input,
        question: sanitizedQuestion,
        selectionText: sanitizedSelectionText,
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
    const rawContent = String(result.data?.choices?.[0]?.message?.content ?? "");
    const answer = normalizeAiContent(rawContent);
    // 若模型返回过短（< 10 字符）或仅为空洞确认，视为无效回答
    const minLength = 10;
    const isTooShort = answer.length < minLength;
    const isNonAnswer = /^(已基于当前页面|根据当前页面|已识别|好的|收到|明白了?)[，。]?$/.test(answer);
    const finalAnswer = (answer && !isTooShort && !isNonAnswer)
      ? answer
      : `⚠️ 模型返回无效回答（${answer ? `"${answer}"` : "空内容"}）。\n\n原始响应长度: ${rawContent.length} 字符\n模型: ${env.deepseekModel}\n如有疑问请联系管理员。`;
    if (env.pageAgentDebug) {
      logger.debug("page.agent.answer.model_response", {
        conversationId: input.conversationId,
        rawAnswerPreview: previewText(rawContent, 220),
        answerLength: answer.length,
        isTooShort,
        isNonAnswer,
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
  } catch (error: any) {
    const errorDetail = error?.response?.data?.error?.message
      || error?.message
      || String(error);
    const answer = `⚠️ 模型调用失败：${errorDetail}\n\n模型: ${env.deepseekModel}\n请检查模型配置或联系管理员。`;
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
      errorDetail,
      statusCode: error?.response?.status,
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

/**
 * SSE 流式回答 — 将 DeepSeek chunk 逐段推给客户端
 * 流结束时保存完整消息到 DB
 */
export const streamPageAnswer = async (
  input: PageAgentRequestBody,
  userId: string,
  response: Response
): Promise<void> => {
  const startedAt = Date.now();
  logger.info("page.agent.stream.enter", {
    conversationId: input.conversationId,
    userId,
    pageType: input.pageType,
    route: input.route,
  });

  // 1. 验证会话
  const conversation = await pageAgentConversationStore.getById(input.conversationId);
  if (!conversation || conversation.userId !== userId) {
    response.status(403).json({ message: "会话不存在或无权限" });
    return;
  }

  // 2. 准备上下文
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
  const searchSources = usedSiteSearch ? await searchPublishedArticles(input, 3) : [];
  const currentPageSource: PageAgentSource = {
    type: "current_page",
    title: input.pageTitle || "当前页面",
    url: input.route,
  };

  // 3. 保存用户消息
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

  // 4. 设置 SSE headers
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  // 5. 如果未配置 LLM，推送 fallback
  if (!env.deepseekApiBaseUrl) {
    const fallback = buildFallbackAnswer(input);
    response.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
    response.write(`data: ${JSON.stringify({ done: true, sources: [currentPageSource, ...searchSources] })}\n\n`);
    response.end();
    // 保存 fallback 消息
    await pageAgentMessageStore.create({
      conversationId: input.conversationId,
      userId,
      role: "assistant",
      messageType: "answer",
      content: fallback,
      sanitizedContent: fallback,
      pageType: input.pageType,
      route: input.route,
      pageTitle: input.pageTitle,
      contextPayload: input.context,
      sourcesPayload: [currentPageSource, ...searchSources],
      model: env.deepseekModel,
    });
    await pageAgentConversationStore.touch(input.conversationId);
    return;
  }

  // 6. 构建消息并调用 LLM 流式
  const sanitizedSelectionText = input.selectionText?.trim()
    ? sanitizeForModel(input.selectionText.trim())
    : undefined;
  const messages = buildPageAgentMessages({
    request: { ...input, question: sanitizedQuestion, selectionText: sanitizedSelectionText },
    historyMessages,
    userProfile,
    searchSources,
  });

  let fullAnswer = "";
  let streamBuffer = "";
  let streamError: Error | null = null;

  // DEBUG: log prompt size to help diagnose empty answers
  const msgSizes = messages.map((m) => `${m.role}:${m.content.length}ch`);
  logger.info("page.agent.stream.debug.prompt", {
    userId,
    conversationId: input.conversationId,
    model: env.deepseekModel,
    messageCount: messages.length,
    totalPromptChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    msgSizes,
  });

  try {
    const apiCallStart = Date.now();
    const llmResponse: AxiosResponse<Stream> = await axios.post(
      `${env.deepseekApiBaseUrl}/v1/chat/completions`,
      {
        model: env.deepseekModel,
        messages,
        temperature: 0.2,
        stream: true,
      },
      {
        headers: env.deepseekApiKey
          ? { Authorization: `Bearer ${env.deepseekApiKey}` }
          : undefined,
        responseType: "stream",
        timeout: 120000,
      }
    );

    let chunkCount = 0;
    let contentChunkCount = 0;
    llmResponse.data.on("data", (chunk: Buffer) => {
      chunkCount++;
      streamBuffer += chunk.toString();
      const lines = streamBuffer.split("\n");
      // 最后一行可能不完整，保留到下次拼接
      streamBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullAnswer += token;
            response.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {
          // skip malformed line — LLM APIs produce well-formed JSON per line,
          // so a parse failure here indicates a genuinely corrupt chunk
        }
      }
    });

    llmResponse.data.on("end", () => {
      (async () => {
        // DEBUG: log stream summary before normalization
        logger.info("page.agent.stream.debug.end", {
          userId,
          conversationId: input.conversationId,
          totalChunks: chunkCount,
          contentChunks: contentChunkCount,
          fullAnswerLength: fullAnswer.length,
          fullAnswerPreview: fullAnswer.slice(0, 200),
          streamBufferRemaining: streamBuffer.length,
          apiCallDurationMs: Date.now() - apiCallStart,
        });
        const normalized = normalizeAiContent(fullAnswer);
        const minLength = 10;
        const isTooShort = normalized.length < minLength;
        const isNonAnswer = /^(已基于当前页面|根据当前页面|已识别|好的|收到|明白了?)[，。]?$/.test(normalized);
        const finalAnswer = (normalized && !isTooShort && !isNonAnswer)
          ? normalized
          : `⚠️ 模型返回无效回答（${normalized ? `"${normalized}"` : "空内容"}）。\n\n原始响应长度: ${fullAnswer.length} 字符\n模型: ${env.deepseekModel}\n如有疑问请联系管理员。`;
        // DEBUG: log normalization result
        logger.info("page.agent.stream.debug.normalized", {
          userId,
          conversationId: input.conversationId,
          rawLength: fullAnswer.length,
          normalizedLength: normalized.length,
          isTooShort,
          isNonAnswer,
          finalAnswerPreview: finalAnswer.slice(0, 200),
        });
        // 保存完整回答
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
        await pageAgentConversationStore.touch(input.conversationId);
        response.write(`data: ${JSON.stringify({
          done: true,
          answer: finalAnswer,
          sources: [currentPageSource, ...searchSources],
          meta: {
            usedCurrentPage: true,
            usedSiteSearch,
            usedHistory: historyMessages.length > 0,
            usedUserProfile: Boolean(userProfile),
            model: env.deepseekModel,
          },
        })}\n\n`);
        response.end();
        logger.info("page.agent.stream.finish", {
          userId,
          conversationId: input.conversationId,
          answerLength: finalAnswer.length,
          durationMs: Date.now() - startedAt,
        });
      })().catch((err) => {
        logger.error("page.agent.stream.end_handler_failed", { err, conversationId: input.conversationId });
      });
    });

    llmResponse.data.on("error", (err: Error) => {
      (async () => {
        streamError = err;
        const errorAnswer = `⚠️ 模型流式调用失败：${err.message}\n\n模型: ${env.deepseekModel}\n请检查模型配置或联系管理员。`;
        response.write(`data: ${JSON.stringify({ token: errorAnswer })}\n\n`);
        response.write(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`);
        response.end();
        await pageAgentMessageStore.create({
          conversationId: input.conversationId,
          userId,
          role: "assistant",
          messageType: "answer",
          content: errorAnswer,
          sanitizedContent: errorAnswer,
          pageType: input.pageType,
          route: input.route,
          pageTitle: input.pageTitle,
          contextPayload: input.context,
          sourcesPayload: [currentPageSource, ...searchSources],
          model: env.deepseekModel,
        });
        await pageAgentConversationStore.touch(input.conversationId);
        logger.error("page.agent.stream.failed", {
          userId,
          conversationId: input.conversationId,
          error: err.message,
          durationMs: Date.now() - startedAt,
        });
      })().catch((innerErr) => {
        logger.error("page.agent.stream.error_handler_failed", { innerErr, originalError: err.message, conversationId: input.conversationId });
      });
    });
  } catch (error: any) {
    const errorDetail = error?.response?.data?.error?.message
      || error?.message
      || String(error);
    const errorAnswer = `⚠️ 模型流式调用失败：${errorDetail}\n\n模型: ${env.deepseekModel}\n请检查模型配置或联系管理员。`;
    response.write(`data: ${JSON.stringify({ token: errorAnswer })}\n\n`);
    response.write(`data: ${JSON.stringify({ done: true, error: errorDetail })}\n\n`);
    response.end();
    await pageAgentMessageStore.create({
      conversationId: input.conversationId,
      userId,
      role: "assistant",
      messageType: "answer",
      content: errorAnswer,
      sanitizedContent: errorAnswer,
      pageType: input.pageType,
      route: input.route,
      pageTitle: input.pageTitle,
      contextPayload: input.context,
      sourcesPayload: [currentPageSource, ...searchSources],
      model: env.deepseekModel,
    });
    await pageAgentConversationStore.touch(input.conversationId);
    logger.error("page.agent.stream.failed", {
      userId,
      conversationId: input.conversationId,
      errorDetail,
      statusCode: error?.response?.status,
      durationMs: Date.now() - startedAt,
    });
  }
};
