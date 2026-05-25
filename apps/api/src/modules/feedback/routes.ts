import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { feedbackLikeStore, feedbackStore, recordAnalyticsEventSafely } from "../../lib/store";
import {
  requireAdminOrFeedbackReadToken,
  requireAuth,
  requireFeedbackReader,
} from "../../middleware/auth";
import type { FeedbackStatus } from "../../lib/types";

const createSchema = z.object({
  type: z.enum(["bug", "ux", "content", "other"]),
  content: z.string().trim().min(1).max(4000),
  contact: z.string().trim().max(255).optional(),
  pageRoute: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

const listSchema = z.object({
  type: z.enum(["bug", "ux", "content", "other"]).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const feedbackRouter = Router();

feedbackRouter.get(
  "/external",
  requireAdminOrFeedbackReadToken,
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    logger.info("feedback.external.read.start", {
      type: parsed.data.type,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      stage: "list",
    });

    try {
      const result = await feedbackStore.list(parsed.data);
      logger.info("feedback.external.read.success", {
        type: parsed.data.type,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total: result.total,
        returnedCount: result.items.length,
        stage: "list",
      });
      response.json({
        items: result.items,
        pagination: {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          total: result.total,
        },
      });
    } catch (error) {
      logger.error("feedback.external.read.failed", {
        type: parsed.data.type,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        stage: "list",
        error,
      });
      response.status(500).json({ message: "反馈查询失败" });
    }
  }
);

const adminListSchema = z.object({
  type: z.enum(["bug", "ux", "content", "other"]).optional(),
  status: z.string().optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  includeEval: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true")
    .optional()
    .default(false),
});

feedbackRouter.get("/admin", requireFeedbackReader, async (request, response) => {
  const parsed = adminListSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  logger.info("feedback.admin.read.start", {
    type: parsed.data.type,
    status: parsed.data.status,
    startAt: parsed.data.startAt,
    endAt: parsed.data.endAt,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    includeEval: parsed.data.includeEval,
    stage: "list",
  });

  try {
    const result = await feedbackStore.list({
      ...parsed.data,
      includeEval: parsed.data.includeEval,
    });
    logger.info("feedback.admin.read.success", {
      type: parsed.data.type,
      status: parsed.data.status,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      includeEval: parsed.data.includeEval,
      total: result.total,
      returnedCount: result.items.length,
      stage: "list",
    });
    response.json({
      items: result.items,
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total: result.total,
      },
    });
  } catch (error) {
    logger.error("feedback.admin.read.failed", {
      type: parsed.data.type,
      status: parsed.data.status,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      includeEval: parsed.data.includeEval,
      stage: "list",
      error,
    });
    response.status(500).json({ message: "反馈查询失败" });
  }
});

feedbackRouter.post("/", requireAuth, async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id ?? (env.devAuthBypass ? "dev-mock-id" : undefined);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  logger.info("feedback.submit.start", {
    userId,
    pageRoute: parsed.data.pageRoute,
    pageTitle: parsed.data.pageTitle,
    type: parsed.data.type,
    stage: "create",
  });

  try {
    const item = await feedbackStore.create({
      userId,
      type: parsed.data.type,
      content: parsed.data.content,
      contact: parsed.data.contact,
      pageRoute: parsed.data.pageRoute,
      pageTitle: parsed.data.pageTitle,
      source: "web_feedback",
    });
    logger.info("feedback.submit.success", {
      userId,
      feedbackId: item.id,
      pageRoute: item.pageRoute,
      type: item.type,
      stage: "create",
    });
    await recordAnalyticsEventSafely({
      eventType: "feedback",
      eventName: "feedback_created",
      userId,
      pageRoute: parsed.data.pageRoute,
      pageTitle: parsed.data.pageTitle,
      sourceModule: "feedback.routes",
      eventPayload: {
        type: parsed.data.type,
        source: "web_feedback",
      },
    });
    response.status(201).json(item);
  } catch (error) {
    logger.error("feedback.submit.failed", {
      userId,
      pageRoute: parsed.data.pageRoute,
      pageTitle: parsed.data.pageTitle,
      type: parsed.data.type,
      stage: "create",
      error,
    });
    response.status(500).json({ message: "反馈提交失败，请稍后重试" });
  }
});

const patchSchema = z
  .object({
    status: z
      .enum(["pending", "evaluating", "snoozed", "approved", "in_progress", "testing", "deployed", "verified", "failed_testing", "reverted", "wontfix", "duplicate"])
      .optional(),
    adminNote: z.string().trim().max(5000).optional(),
  })
  .refine((data) => data.status || data.adminNote !== undefined, {
    message: "至少需要提供 status 或 adminNote",
  });

feedbackRouter.patch("/admin/:id", requireFeedbackReader, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const updated = await feedbackStore.update(req.params.id as string, parsed.data as { status?: FeedbackStatus; adminNote?: string });
  if (!updated) {
    res.status(404).json({ message: "反馈记录不存在" });
    return;
  }
  res.json(updated);
});


// --- Public feedback wall ---

const publicListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["recent", "popular"]).default("recent"),
});

feedbackRouter.get("/public", async (request, response) => {
  const parsed = publicListSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  try {
    const currentUserId = request.session.user?.id ?? undefined;
    const result = await feedbackLikeStore.listPublic({
      ...parsed.data,
      currentUserId,
    });
    response.json({ items: result.items, total: result.total });
  } catch (error) {
    logger.error("feedback.public.list.failed", { error });
    response.status(500).json({ message: "查询失败" });
  }
});

feedbackRouter.post("/public/:id/like", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  try {
    await feedbackLikeStore.like(request.params.id, userId);
    const likeCount = await feedbackLikeStore.getLikeCount(request.params.id);
    response.json({ likedByMe: true, likeCount });
  } catch (error) {
    logger.error("feedback.public.like.failed", { error });
    response.status(500).json({ message: "点赞失败" });
  }
});

feedbackRouter.delete("/public/:id/like", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  try {
    await feedbackLikeStore.unlike(request.params.id, userId);
    const likeCount = await feedbackLikeStore.getLikeCount(request.params.id);
    response.json({ likedByMe: false, likeCount });
  } catch (error) {
    logger.error("feedback.public.unlike.failed", { error });
    response.status(500).json({ message: "取消点赞失败" });
  }
});
