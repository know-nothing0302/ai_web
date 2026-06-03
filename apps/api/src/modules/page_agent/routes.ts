import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  recordAnalyticsEventSafely,
  userProfileAnalysisJobStore,
} from "../../lib/store";
import { requireAdminOrInternalToken, requireAuth } from "../../middleware/auth";
import { pageAgentQaRateLimiter } from "../../middleware/rate_limit";
import { runUserProfileAnalysisJob } from "./profile_service";
import { sanitizeForModel } from "./sanitize";
import { answerPageQuestion, streamPageAnswer } from "./service";

const createConversationSchema = z.object({
  pageType: z.enum(["article_detail", "article_list", "subscription", "admin"]),
  route: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

const pageAgentSchema = z.object({
  conversationId: z.uuid(),
  question: z.string().trim().min(1).max(2000),
  pageType: z.enum(["article_detail", "article_list", "subscription", "admin"]),
  route: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
  selectionText: z.string().trim().max(4000).optional(),
  context: z.record(z.string(), z.unknown()),
  verbosity: z.enum(["concise", "detailed"]).optional(),
});

const feedbackSchema = z.object({
  score: z.union([z.literal(1), z.literal(-1)]),
  tag: z.string().trim().min(1).max(50),
  content: z.string().trim().min(1).max(1000),
});

const profileAnalysisSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  mode: z.enum(["manual"]).default("manual"),
});

const getAuthenticatedUserId = (request: {
  session: { user?: { id: string } };
}): string | undefined => {
  if (request.session.user?.id) {
    return request.session.user.id;
  }
  return env.devAuthBypass ? "dev-mock-id" : undefined;
};

export const pageAgentRouter = Router();

pageAgentRouter.post("/conversations", requireAuth, async (request, response) => {
  logger.info("page.agent.conversation.create.request", {
    hasSessionUser: Boolean(request.session.user),
    devAuthBypass: env.devAuthBypass,
    route: request.originalUrl,
    bodyPageType: request.body?.pageType,
    bodyRoute: request.body?.route,
  });
  const parsed = createConversationSchema.safeParse(request.body);
  if (!parsed.success) {
    logger.warn("page.agent.conversation.create.invalid", {
      errors: z.flattenError(parsed.error),
    });
    response.status(400).json({ message: "参数错误", errors: z.flattenError(parsed.error) });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    logger.warn("page.agent.conversation.create.unauthorized");
    response.status(401).json({ message: "未登录" });
    return;
  }
  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: parsed.data.pageType,
    route: parsed.data.route,
    pageTitle: parsed.data.pageTitle,
  });
  logger.info("page.agent.conversation.create.success", {
    userId,
    conversationId: conversation.id,
    pageType: conversation.pageType,
    route: conversation.route,
  });
  await recordAnalyticsEventSafely({
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

pageAgentRouter.patch("/conversations/:id", requireAuth, async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const conversationId = String(request.params.id);
  const conversation = await pageAgentConversationStore.getById(conversationId);
  if (!conversation || conversation.userId !== userId) {
    response.status(404).json({ message: "会话不存在" });
    return;
  }
  const { title } = request.body;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    response.status(400).json({ message: "标题不能为空" });
    return;
  }
  await pageAgentConversationStore.updateTitle(conversationId, title.trim().slice(0, 100));
  response.json({ success: true });
});

pageAgentRouter.get("/conversations", requireAuth, async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const items = await pageAgentConversationStore.listByUser(userId, 20);
  response.json({ items });
});

pageAgentRouter.get("/conversations/:id/messages", requireAuth, async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const conversationId = String(request.params.id);
  const conversation = await pageAgentConversationStore.getById(conversationId);
  if (!conversation || conversation.userId !== userId) {
    response.status(404).json({ message: "会话不存在" });
    return;
  }
  const items = await pageAgentMessageStore.listRecentByConversation(conversation.id, 100);
  response.json({ items });
});

pageAgentRouter.post("/qa", requireAuth, pageAgentQaRateLimiter, async (request, response) => {
  logger.info("page.agent.qa.request", {
    hasSessionUser: Boolean(request.session.user),
    devAuthBypass: env.devAuthBypass,
    bodyConversationId: request.body?.conversationId,
    bodyPageType: request.body?.pageType,
    bodyRoute: request.body?.route,
    questionLength:
      typeof request.body?.question === "string" ? request.body.question.length : undefined,
  });
  const parsed = pageAgentSchema.safeParse(request.body);
  if (!parsed.success) {
    logger.warn("page.agent.qa.invalid", {
      errors: z.flattenError(parsed.error),
    });
    response.status(400).json({ message: "参数错误", errors: z.flattenError(parsed.error) });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    logger.warn("page.agent.qa.unauthorized", {
      conversationId: parsed.data.conversationId,
    });
    response.status(401).json({ message: "未登录" });
    return;
  }
  const result = await answerPageQuestion(parsed.data, userId);
  logger.info("page.agent.qa.response", {
    userId,
    conversationId: result.conversationId,
    answerLength: result.answer.length,
    usedHistory: result.meta.usedHistory,
    usedUserProfile: result.meta.usedUserProfile,
    usedSiteSearch: result.meta.usedSiteSearch,
  });
  response.json(result);
});

// SSE 流式 — 代替原 /qa 用于前端实时渲染
pageAgentRouter.post("/qa/stream", requireAuth, pageAgentQaRateLimiter, (request, response) => {
  const parsed = pageAgentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: z.flattenError(parsed.error) });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  streamPageAnswer(parsed.data, userId, response);
});

pageAgentRouter.post("/messages/:id/feedback", requireAuth, async (request, response) => {
  const parsed = feedbackSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: z.flattenError(parsed.error) });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const messageId = String(request.params.id);
  const message = await pageAgentMessageStore.getById(messageId);
  if (!message || message.userId !== userId || message.role !== "assistant") {
    response.status(404).json({ message: "消息不存在" });
    return;
  }
  const feedback = await pageAgentMessageStore.create({
    conversationId: message.conversationId,
    userId: message.userId,
    role: "feedback",
    messageType: "feedback",
    content: parsed.data.content,
    sanitizedContent: sanitizeForModel(parsed.data.content),
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

pageAgentRouter.post(
  "/profile-analysis/run",
  requireAdminOrInternalToken,
  async (request, response) => {
    const parsed = profileAnalysisSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: z.flattenError(parsed.error) });
      return;
    }
    const job = await runUserProfileAnalysisJob({
      triggerMode: "manual",
      targetUserId: parsed.data.userId,
    });
    response.json(job);
  }
);

pageAgentRouter.get(
  "/profile-analysis/jobs/:id",
  requireAdminOrInternalToken,
  async (request, response) => {
    const jobId = String(request.params.id);
    const job = await userProfileAnalysisJobStore.getById(jobId);
    if (!job) {
      response.status(404).json({ message: "任务不存在" });
      return;
    }
    response.json(job);
  }
);
