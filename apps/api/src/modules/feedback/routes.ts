import { exec } from "child_process";
import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { query, withTransaction } from "../../lib/db";
import { logger } from "../../lib/logger";
import { feedbackLikeStore, feedbackStore, recordAnalyticsEventSafely } from "../../lib/store";
import {
  requireAdminOrFeedbackReadToken,
  requireAdminOrFeedbackWriteToken,
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
  search: z.string().trim().optional(),
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

const myListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

feedbackRouter.get("/my", requireAuth, async (request, response) => {
  const parsed = myListSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id ?? (env.devAuthBypass ? "dev-mock-id" : undefined);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  try {
    const result = await feedbackStore.list({
      userId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
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
    logger.error("feedback.my.list.failed", { userId, stage: "my_list", error });
    response.status(500).json({ message: "查询失败" });
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

  const feedbackId = String(req.params.id);
  const { status, adminNote } = parsed.data;

  // When approving, look up AI evaluation to determine next action
  if (status === "approved") {
    try {
      const evalResult = await query<{ suggested_action: string; suggestion: string }>(
        `SELECT suggested_action, suggestion FROM feedback_evaluations WHERE feedback_id = $1 ORDER BY evaluated_at DESC LIMIT 1`,
        [feedbackId]
      );

      if (evalResult.rows.length > 0) {
        const ev = evalResult.rows[0];

        if (ev.suggested_action === "auto_fix") {
          // auto_fix → transition to in_progress and dispatch to cc-ai-web
          const updated = await feedbackStore.update(feedbackId, { status: "in_progress", adminNote });
          if (!updated) {
            res.status(404).json({ message: "反馈记录不存在" });
            return;
          }

          const safeSuggestion = (ev.suggestion || "见评估详情").replace(/'/g, "'\\''");
          const dispatchMsg = `任务ID: auto-fix-${feedbackId.slice(0, 8)} 请修复反馈 #${feedbackId.slice(0, 8)}: ${safeSuggestion}`;
          exec(`/opt/hermes/scripts/cc-send.sh cc-ai-web '${dispatchMsg}'`, (err) => {
            if (err) {
              logger.error("feedback.dispatch.failed", { feedbackId, session: "cc-ai-web", error: err.message, stage: "dispatch" });
            } else {
              logger.info("feedback.dispatch.sent", { feedbackId, session: "cc-ai-web", stage: "dispatch" });
            }
          });

          logger.info("feedback.approve.auto_fix", { feedbackId, stage: "approve" });
          res.json(updated);
          return;
        }

        // batch_review / human_gate → keep "approved" (frontend groups them correctly)
        logger.info("feedback.approve.success", { feedbackId, suggestedAction: ev.suggested_action, stage: "approve" });
      }
    } catch (error) {
      logger.error("feedback.approve.eval_lookup.failed", { feedbackId, error, stage: "approve" });
      // Fall through to default update
    }
  }

  // Default update path (non-approved statuses, or approval without evaluation)
  const updateInput: Record<string, unknown> = {};
  if (status) updateInput.status = status;
  if (adminNote !== undefined) updateInput.adminNote = adminNote;

  const updated = await feedbackStore.update(feedbackId, updateInput as { status?: FeedbackStatus; adminNote?: string });
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
    const feedbackId = String(request.params.id);
    await feedbackLikeStore.like(feedbackId, userId);
    const likeCount = await feedbackLikeStore.getLikeCount(feedbackId);
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
    const feedbackId = String(request.params.id);
    await feedbackLikeStore.unlike(feedbackId, userId);
    const likeCount = await feedbackLikeStore.getLikeCount(feedbackId);
    response.json({ likedByMe: false, likeCount });
  } catch (error) {
    logger.error("feedback.public.unlike.failed", { error });
    response.status(500).json({ message: "取消点赞失败" });
  }
});

// --- Internal API (feedback pipeline) ---

const internalEvaluationSchema = z.object({
  evaluations: z.array(z.object({
    feedback_id: z.string().uuid(),
    eval_type: z.string().min(1),
    severity: z.string().min(1),
    fix_scope: z.string().min(1),
    alignment: z.string().min(1),
    suggested_action: z.string().min(1),
    suggestion: z.string().optional(),
  })).min(1),
});

feedbackRouter.post(
  "/internal/evaluations",
  requireAdminOrFeedbackWriteToken,
  async (request, response) => {
    const parsed = internalEvaluationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    logger.info("feedback.internal.evaluations.start", {
      count: parsed.data.evaluations.length,
      stage: "internal_evaluate",
    });

    try {
      const result = await withTransaction(async (client) => {
        let inserted = 0;
        let statusUpdated = 0;

        for (const item of parsed.data.evaluations) {
          await client.query(
            `INSERT INTO feedback_evaluations (feedback_id, eval_type, severity, fix_scope, alignment, suggested_action, suggestion)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (feedback_id) DO UPDATE SET
               eval_type = EXCLUDED.eval_type,
               severity = EXCLUDED.severity,
               fix_scope = EXCLUDED.fix_scope,
               alignment = EXCLUDED.alignment,
               suggested_action = EXCLUDED.suggested_action,
               suggestion = EXCLUDED.suggestion,
               evaluated_at = NOW()`,
            [item.feedback_id, item.eval_type, item.severity, item.fix_scope, item.alignment, item.suggested_action, item.suggestion ?? null]
          );
          inserted++;

          const updateResult = await client.query(
            `UPDATE feedback_entries SET status = 'evaluating' WHERE id = $1 AND status = 'pending'`,
            [item.feedback_id]
          );
          if ((updateResult.rowCount ?? 0) > 0) {
            statusUpdated++;
          }
        }

        return { inserted, statusUpdated };
      });

      logger.info("feedback.internal.evaluations.success", {
        inserted: result.inserted,
        statusUpdated: result.statusUpdated,
        stage: "internal_evaluate",
      });

      response.json({ ok: true, ...result });
    } catch (error) {
      logger.error("feedback.internal.evaluations.failed", { stage: "internal_evaluate", error });
      response.status(500).json({ message: "评估写入失败" });
    }
  }
);

const batchStatusSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["in_progress", "testing", "fixed", "deployed", "failed_testing", "wontfix"]),
  })).min(1),
});

feedbackRouter.patch(
  "/internal/batch-status",
  requireAdminOrFeedbackWriteToken,
  async (request, response) => {
    const parsed = batchStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    logger.info("feedback.internal.batch-status.start", {
      count: parsed.data.items.length,
      stage: "internal_batch_status",
    });

    try {
      const updated = await withTransaction(async (client) => {
        let count = 0;

        for (const item of parsed.data.items) {
          const result = await client.query(
            `UPDATE feedback_entries SET status = $1 WHERE id = $2`,
            [item.status, item.id]
          );
          count += result.rowCount ?? 0;
        }

        return count;
      });

      logger.info("feedback.internal.batch-status.success", {
        updated,
        stage: "internal_batch_status",
      });

      response.json({ ok: true, updated });
    } catch (error) {
      logger.error("feedback.internal.batch-status.failed", { stage: "internal_batch_status", error });
      response.status(500).json({ message: "状态更新失败" });
    }
  }
);
