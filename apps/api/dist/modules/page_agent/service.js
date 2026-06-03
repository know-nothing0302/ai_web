"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamPageAnswer = exports.answerPageQuestion = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const prompts_1 = require("./prompts");
const sanitize_1 = require("./sanitize");
const normalizeAiContent = (content) => {
    let normalized = String(content ?? "").trim();
    if (normalized.includes("</think>")) {
        normalized = normalized.split("</think>").slice(-1)[0]?.trim() ?? normalized;
    }
    return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};
const shouldSearchSite = (question) => {
    const normalized = question.trim();
    return ["还有", "相关文章", "帮我找", "有没有", "类似文章", "最近发布"].some((token) => normalized.includes(token));
};
const buildSearchKeyword = (input) => {
    if (input.selectionText?.trim()) {
        return input.selectionText.trim().slice(0, 60);
    }
    const title = typeof input.context.title === "string" && input.context.title.trim()
        ? input.context.title.trim()
        : "";
    if (title) {
        return title.slice(0, 60);
    }
    return input.question.trim().slice(0, 60);
};
const toArticleSource = (article) => ({
    type: "article",
    articleId: article.id,
    title: article.title,
    url: `/articles/${article.id}`,
    originalUrl: article.originalUrl,
    summary: article.summary,
});
const searchPublishedArticles = async (input, limit) => {
    const keyword = buildSearchKeyword(input);
    const channelCode = typeof input.context.channelCode === "string" && input.context.channelCode.trim()
        ? input.context.channelCode.trim()
        : undefined;
    const items = await store_1.articleStore.list({
        keyword: keyword || undefined,
        channelCode,
        status: "published",
    });
    return items.slice(0, limit).map(toArticleSource);
};
const buildFallbackAnswer = (input) => {
    const selected = input.selectionText?.trim();
    if (selected) {
        return `你当前选中的内容是：${selected}\n\n我已拿到当前页面上下文，但当前未完成大模型回答链路，建议先结合页面正文继续阅读。`;
    }
    if (input.pageType === "article_detail") {
        const title = typeof input.context.title === "string" ? input.context.title.trim() : "当前文章";
        const sourceContent = typeof input.context.sourceContent === "string"
            ? input.context.sourceContent.trim()
            : "";
        const contentPreview = typeof input.context.contentPreview === "string"
            ? input.context.contentPreview.trim()
            : "";
        const summary = typeof input.context.summary === "string" ? input.context.summary.trim() : "";
        if (sourceContent) {
            return `${title}涉及的重点内容包括：${sourceContent.slice(0, 300)}${sourceContent.length > 300 ? "..." : ""}`;
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
const previewText = (value, maxLength) => {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};
const answerPageQuestion = async (input, requestUserId) => {
    const startedAt = Date.now();
    logger_1.logger.info("page.agent.answer.enter", {
        conversationId: input.conversationId,
        requestUserId,
        pageType: input.pageType,
        route: input.route,
    });
    const conversation = await store_1.pageAgentConversationStore.getById(input.conversationId);
    if (!conversation) {
        logger_1.logger.warn("page.agent.answer.conversation_missing", {
            conversationId: input.conversationId,
            requestUserId,
        });
        throw new Error("会话不存在或无权限访问");
    }
    if (requestUserId && conversation.userId !== requestUserId) {
        logger_1.logger.warn("page.agent.answer.conversation_forbidden", {
            conversationId: input.conversationId,
            requestUserId,
            ownerUserId: conversation.userId,
        });
        throw new Error("会话不存在或无权限访问");
    }
    const userId = requestUserId ?? conversation.userId;
    const userProfile = await store_1.userProfileStore.getByUserId(userId);
    const historyMessages = (await store_1.pageAgentMessageStore.listRecentByConversation(input.conversationId, 8))
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
        ...item,
        sanitizedContent: (0, sanitize_1.truncateForModel)(item.sanitizedContent ?? item.content, 1200),
    }));
    const sanitizedQuestion = (0, sanitize_1.sanitizeForModel)(input.question);
    const usedSiteSearch = shouldSearchSite(input.question);
    logger_1.logger.info("page.agent.answer.start", {
        userId,
        conversationId: input.conversationId,
        pageType: input.pageType,
        route: input.route,
        questionLength: input.question.length,
        hasSelectionText: Boolean(input.selectionText?.trim()),
        historyMessageCount: historyMessages.length,
        usedUserProfile: Boolean(userProfile),
    });
    const currentPageSource = {
        type: "current_page",
        title: input.pageTitle || "当前页面",
        url: input.route,
    };
    const searchSources = usedSiteSearch ? await searchPublishedArticles(input, 3) : [];
    logger_1.logger.info("page.agent.answer.context_loaded", {
        userId,
        conversationId: input.conversationId,
        historyMessageCount: historyMessages.length,
        usedUserProfile: Boolean(userProfile),
        usedSiteSearch,
        searchSourceCount: searchSources.length,
    });
    if (env_1.env.pageAgentDebug) {
        logger_1.logger.debug("page.agent.answer.context_detail", {
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
    await store_1.pageAgentMessageStore.create({
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
    await (0, store_1.recordAnalyticsEventSafely)({
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
    if (!env_1.env.deepseekApiBaseUrl) {
        const answer = buildFallbackAnswer(input);
        await store_1.pageAgentMessageStore.create({
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
            model: env_1.env.deepseekModel,
        });
        await (0, store_1.recordAnalyticsEventSafely)({
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
        await store_1.pageAgentConversationStore.touch(input.conversationId);
        logger_1.logger.warn("page.agent.answer.fallback", {
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
                model: env_1.env.deepseekModel,
            },
        };
    }
    try {
        const messages = (0, prompts_1.buildPageAgentMessages)({
            request: {
                ...input,
                question: sanitizedQuestion,
            },
            historyMessages,
            userProfile,
            searchSources,
        });
        if (env_1.env.pageAgentDebug) {
            logger_1.logger.debug("page.agent.answer.prompt_preview", {
                conversationId: input.conversationId,
                messageCount: messages.length,
                promptMessages: messages.map((item) => ({
                    role: item.role,
                    preview: previewText(item.content, 220),
                })),
            });
        }
        const result = await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, {
            model: env_1.env.deepseekModel,
            messages,
            temperature: 0.2,
        }, {
            headers: env_1.env.deepseekApiKey
                ? {
                    Authorization: `Bearer ${env_1.env.deepseekApiKey}`,
                }
                : undefined,
            timeout: 60000,
        });
        const answer = normalizeAiContent(result.data?.choices?.[0]?.message?.content);
        const finalAnswer = answer || buildFallbackAnswer(input);
        if (env_1.env.pageAgentDebug) {
            logger_1.logger.debug("page.agent.answer.model_response", {
                conversationId: input.conversationId,
                rawAnswerPreview: previewText(String(result.data?.choices?.[0]?.message?.content ?? ""), 220),
                finalAnswerPreview: previewText(finalAnswer, 220),
            });
        }
        await store_1.pageAgentMessageStore.create({
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
            model: env_1.env.deepseekModel,
        });
        await (0, store_1.recordAnalyticsEventSafely)({
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
        await store_1.pageAgentConversationStore.touch(input.conversationId);
        logger_1.logger.info("page.agent.answer.finish", {
            userId,
            conversationId: input.conversationId,
            pageType: input.pageType,
            route: input.route,
            usedSiteSearch,
            sourceCount: searchSources.length + 1,
            model: env_1.env.deepseekModel,
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
                model: env_1.env.deepseekModel,
            },
        };
    }
    catch (error) {
        const answer = buildFallbackAnswer(input);
        await store_1.pageAgentMessageStore.create({
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
            model: env_1.env.deepseekModel,
        });
        await (0, store_1.recordAnalyticsEventSafely)({
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
        await store_1.pageAgentConversationStore.touch(input.conversationId);
        logger_1.logger.error("page.agent.answer.failed", {
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
                model: env_1.env.deepseekModel,
            },
        };
    }
};
exports.answerPageQuestion = answerPageQuestion;
/**
 * SSE 流式回答 — 将 DeepSeek chunk 逐段推给客户端
 * 流结束时保存完整消息到 DB
 */
const streamPageAnswer = async (input, userId, response) => {
    const startedAt = Date.now();
    logger_1.logger.info("page.agent.stream.enter", {
        conversationId: input.conversationId,
        userId,
        pageType: input.pageType,
        route: input.route,
    });
    // 1. 验证会话
    const conversation = await store_1.pageAgentConversationStore.getById(input.conversationId);
    if (!conversation || conversation.userId !== userId) {
        response.status(403).json({ message: "会话不存在或无权限" });
        return;
    }
    // 2. 准备上下文
    const userProfile = await store_1.userProfileStore.getByUserId(userId);
    const historyMessages = (await store_1.pageAgentMessageStore.listRecentByConversation(input.conversationId, 8))
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
        ...item,
        sanitizedContent: (0, sanitize_1.truncateForModel)(item.sanitizedContent ?? item.content, 1200),
    }));
    const sanitizedQuestion = (0, sanitize_1.sanitizeForModel)(input.question);
    const usedSiteSearch = shouldSearchSite(input.question);
    const searchSources = usedSiteSearch ? await searchPublishedArticles(input, 3) : [];
    const currentPageSource = {
        type: "current_page",
        title: input.pageTitle || "当前页面",
        url: input.route,
    };
    // 3. 保存用户消息
    await store_1.pageAgentMessageStore.create({
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
    if (!env_1.env.deepseekApiBaseUrl) {
        const fallback = buildFallbackAnswer(input);
        response.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
        response.write(`data: ${JSON.stringify({ done: true, sources: [currentPageSource, ...searchSources] })}\n\n`);
        response.end();
        // 保存 fallback 消息
        await store_1.pageAgentMessageStore.create({
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
            model: env_1.env.deepseekModel,
        });
        await store_1.pageAgentConversationStore.touch(input.conversationId);
        return;
    }
    // 6. 构建消息并调用 LLM 流式
    const messages = (0, prompts_1.buildPageAgentMessages)({
        request: { ...input, question: sanitizedQuestion },
        historyMessages,
        userProfile,
        searchSources,
    });
    let fullAnswer = "";
    let streamError = null;
    try {
        const llmResponse = await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, {
            model: env_1.env.deepseekModel,
            messages,
            temperature: 0.2,
            stream: true,
        }, {
            headers: env_1.env.deepseekApiKey
                ? { Authorization: `Bearer ${env_1.env.deepseekApiKey}` }
                : undefined,
            responseType: "stream",
            timeout: 120000,
        });
        llmResponse.data.on("data", (chunk) => {
            const lines = chunk.toString().split("\n").filter((line) => line.startsWith("data: "));
            for (const line of lines) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]")
                    continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    const token = parsed.choices?.[0]?.delta?.content;
                    if (token) {
                        fullAnswer += token;
                        response.write(`data: ${JSON.stringify({ token })}\n\n`);
                    }
                }
                catch {
                    // skip malformed chunk
                }
            }
        });
        llmResponse.data.on("end", async () => {
            const finalAnswer = normalizeAiContent(fullAnswer) || buildFallbackAnswer(input);
            // 保存完整回答
            await store_1.pageAgentMessageStore.create({
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
                model: env_1.env.deepseekModel,
            });
            await store_1.pageAgentConversationStore.touch(input.conversationId);
            response.write(`data: ${JSON.stringify({ done: true, sources: [currentPageSource, ...searchSources] })}\n\n`);
            response.end();
            logger_1.logger.info("page.agent.stream.finish", {
                userId,
                conversationId: input.conversationId,
                answerLength: finalAnswer.length,
                durationMs: Date.now() - startedAt,
            });
        });
        llmResponse.data.on("error", async (err) => {
            streamError = err;
            const fallback = buildFallbackAnswer(input);
            response.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
            response.write(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`);
            response.end();
            await store_1.pageAgentMessageStore.create({
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
                model: env_1.env.deepseekModel,
            });
            await store_1.pageAgentConversationStore.touch(input.conversationId);
            logger_1.logger.error("page.agent.stream.failed", {
                userId,
                conversationId: input.conversationId,
                error: err.message,
                durationMs: Date.now() - startedAt,
            });
        });
    }
    catch (error) {
        const fallback = buildFallbackAnswer(input);
        response.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
        response.write(`data: ${JSON.stringify({ done: true, error: error.message })}\n\n`);
        response.end();
        await store_1.pageAgentMessageStore.create({
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
            model: env_1.env.deepseekModel,
        });
        await store_1.pageAgentConversationStore.touch(input.conversationId);
        logger_1.logger.error("page.agent.stream.failed", {
            userId,
            conversationId: input.conversationId,
            error: error.message,
            durationMs: Date.now() - startedAt,
        });
    }
};
exports.streamPageAnswer = streamPageAnswer;
