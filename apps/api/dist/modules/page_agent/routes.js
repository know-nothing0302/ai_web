"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageAgentRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const auth_1 = require("../../middleware/auth");
const profile_service_1 = require("./profile_service");
const service_1 = require("./service");
const createConversationSchema = zod_1.z.object({
    pageType: zod_1.z.enum(["article_detail", "article_list", "subscription", "admin"]),
    route: zod_1.z.string().trim().min(1).max(500),
    pageTitle: zod_1.z.string().trim().min(1).max(200),
});
const pageAgentSchema = zod_1.z.object({
    conversationId: zod_1.z.uuid(),
    question: zod_1.z.string().trim().min(1).max(2000),
    pageType: zod_1.z.enum(["article_detail", "article_list", "subscription", "admin"]),
    route: zod_1.z.string().trim().min(1).max(500),
    pageTitle: zod_1.z.string().trim().min(1).max(200),
    selectionText: zod_1.z.string().trim().max(4000).optional(),
    context: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
const feedbackSchema = zod_1.z.object({
    score: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(-1)]),
    tag: zod_1.z.string().trim().min(1).max(50),
    content: zod_1.z.string().trim().min(1).max(1000),
});
const profileAnalysisSchema = zod_1.z.object({
    userId: zod_1.z.string().trim().min(1).optional(),
    mode: zod_1.z.enum(["manual"]).default("manual"),
});
const getAuthenticatedUserId = (request) => {
    if (request.session.user?.id) {
        return request.session.user.id;
    }
    return env_1.env.devAuthBypass ? "dev-mock-id" : undefined;
};
exports.pageAgentRouter = (0, express_1.Router)();
exports.pageAgentRouter.post("/conversations", auth_1.requireAuth, async (request, response) => {
    logger_1.logger.info("page.agent.conversation.create.request", {
        hasSessionUser: Boolean(request.session.user),
        devAuthBypass: env_1.env.devAuthBypass,
        route: request.originalUrl,
        bodyPageType: request.body?.pageType,
        bodyRoute: request.body?.route,
    });
    const parsed = createConversationSchema.safeParse(request.body);
    if (!parsed.success) {
        logger_1.logger.warn("page.agent.conversation.create.invalid", {
            errors: zod_1.z.flattenError(parsed.error),
        });
        response.status(400).json({ message: "参数错误", errors: zod_1.z.flattenError(parsed.error) });
        return;
    }
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        logger_1.logger.warn("page.agent.conversation.create.unauthorized");
        response.status(401).json({ message: "未登录" });
        return;
    }
    const conversation = await store_1.pageAgentConversationStore.create({
        userId,
        pageType: parsed.data.pageType,
        route: parsed.data.route,
        pageTitle: parsed.data.pageTitle,
    });
    logger_1.logger.info("page.agent.conversation.create.success", {
        userId,
        conversationId: conversation.id,
        pageType: conversation.pageType,
        route: conversation.route,
    });
    await (0, store_1.recordAnalyticsEventSafely)({
        eventType: "agent",
        eventName: "page_agent_conversation_created",
        userId,
        pageRoute: conversation.route,
        pageTitle: conversation.pageTitle,
        sourceModule: "page_agent.routes",
        eventPayload: {
            pageType: conversation.pageType,
            conversationId: conversation.id,
        },
    });
    response.json(conversation);
});
exports.pageAgentRouter.get("/conversations", auth_1.requireAuth, async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const items = await store_1.pageAgentConversationStore.listByUser(userId, 20);
    response.json({ items });
});
exports.pageAgentRouter.get("/conversations/:id/messages", auth_1.requireAuth, async (request, response) => {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const conversationId = String(request.params.id);
    const conversation = await store_1.pageAgentConversationStore.getById(conversationId);
    if (!conversation || conversation.userId !== userId) {
        response.status(404).json({ message: "会话不存在" });
        return;
    }
    const items = await store_1.pageAgentMessageStore.listRecentByConversation(conversation.id, 100);
    response.json({ items });
});
exports.pageAgentRouter.post("/qa", auth_1.requireAuth, async (request, response) => {
    logger_1.logger.info("page.agent.qa.request", {
        hasSessionUser: Boolean(request.session.user),
        devAuthBypass: env_1.env.devAuthBypass,
        bodyConversationId: request.body?.conversationId,
        bodyPageType: request.body?.pageType,
        bodyRoute: request.body?.route,
        questionLength: typeof request.body?.question === "string" ? request.body.question.length : undefined,
    });
    const parsed = pageAgentSchema.safeParse(request.body);
    if (!parsed.success) {
        logger_1.logger.warn("page.agent.qa.invalid", {
            errors: zod_1.z.flattenError(parsed.error),
        });
        response.status(400).json({ message: "参数错误", errors: zod_1.z.flattenError(parsed.error) });
        return;
    }
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        logger_1.logger.warn("page.agent.qa.unauthorized", {
            conversationId: parsed.data.conversationId,
        });
        response.status(401).json({ message: "未登录" });
        return;
    }
    const result = await (0, service_1.answerPageQuestion)(parsed.data, userId);
    logger_1.logger.info("page.agent.qa.response", {
        userId,
        conversationId: result.conversationId,
        answerLength: result.answer.length,
        usedHistory: result.meta.usedHistory,
        usedUserProfile: result.meta.usedUserProfile,
        usedSiteSearch: result.meta.usedSiteSearch,
    });
    response.json(result);
});
exports.pageAgentRouter.post("/messages/:id/feedback", auth_1.requireAuth, async (request, response) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: zod_1.z.flattenError(parsed.error) });
        return;
    }
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const messageId = String(request.params.id);
    const message = await store_1.pageAgentMessageStore.getById(messageId);
    if (!message || message.userId !== userId || message.role !== "assistant") {
        response.status(404).json({ message: "消息不存在" });
        return;
    }
    const feedback = await store_1.pageAgentMessageStore.create({
        conversationId: message.conversationId,
        userId: message.userId,
        role: "feedback",
        messageType: "feedback",
        content: parsed.data.content,
        sanitizedContent: parsed.data.content,
        pageType: message.pageType,
        route: message.route,
        pageTitle: message.pageTitle,
        contextPayload: {},
        sourcesPayload: [],
        feedbackScore: parsed.data.score,
        feedbackTag: parsed.data.tag,
    });
    response.json(feedback);
});
exports.pageAgentRouter.post("/profile-analysis/run", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = profileAnalysisSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: zod_1.z.flattenError(parsed.error) });
        return;
    }
    const job = await (0, profile_service_1.runUserProfileAnalysisJob)({
        triggerMode: "manual",
        targetUserId: parsed.data.userId,
    });
    response.json(job);
});
exports.pageAgentRouter.get("/profile-analysis/jobs/:id", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const jobId = String(request.params.id);
    const job = await store_1.userProfileAnalysisJobStore.getById(jobId);
    if (!job) {
        response.status(404).json({ message: "任务不存在" });
        return;
    }
    response.json(job);
});
