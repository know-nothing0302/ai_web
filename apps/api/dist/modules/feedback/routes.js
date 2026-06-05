"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const db_1 = require("../../lib/db");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const auth_1 = require("../../middleware/auth");
const createSchema = zod_1.z.object({
    type: zod_1.z.enum(["bug", "ux", "content", "other"]),
    content: zod_1.z.string().trim().min(1).max(4000),
    contact: zod_1.z.string().trim().max(255).optional(),
    pageRoute: zod_1.z.string().trim().min(1).max(500),
    pageTitle: zod_1.z.string().trim().min(1).max(200),
});
const listSchema = zod_1.z.object({
    type: zod_1.z.enum(["bug", "ux", "content", "other"]).optional(),
    startAt: zod_1.z.string().datetime({ offset: true }).optional(),
    endAt: zod_1.z.string().datetime({ offset: true }).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    includeEval: zod_1.z
        .union([zod_1.z.literal("true"), zod_1.z.literal("false"), zod_1.z.boolean()])
        .transform((v) => v === true || v === "true")
        .optional()
        .default(false),
});
exports.feedbackRouter = (0, express_1.Router)();
exports.feedbackRouter.get("/external", auth_1.requireAdminOrFeedbackReadToken, async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    logger_1.logger.info("feedback.external.read.start", {
        type: parsed.data.type,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        stage: "list",
    });
    try {
        const result = await store_1.feedbackStore.list(parsed.data);
        logger_1.logger.info("feedback.external.read.success", {
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
    }
    catch (error) {
        logger_1.logger.error("feedback.external.read.failed", {
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
});
const adminListSchema = zod_1.z.object({
    type: zod_1.z.enum(["bug", "ux", "content", "other"]).optional(),
    status: zod_1.z.string().optional(),
    search: zod_1.z.string().trim().optional(),
    startAt: zod_1.z.string().datetime({ offset: true }).optional(),
    endAt: zod_1.z.string().datetime({ offset: true }).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    includeEval: zod_1.z
        .union([zod_1.z.literal("true"), zod_1.z.literal("false"), zod_1.z.boolean()])
        .transform((v) => v === true || v === "true")
        .optional()
        .default(false),
});
exports.feedbackRouter.get("/admin", auth_1.requireFeedbackReader, async (request, response) => {
    const parsed = adminListSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    logger_1.logger.info("feedback.admin.read.start", {
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
        const result = await store_1.feedbackStore.list({
            ...parsed.data,
            includeEval: parsed.data.includeEval,
        });
        logger_1.logger.info("feedback.admin.read.success", {
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
    }
    catch (error) {
        logger_1.logger.error("feedback.admin.read.failed", {
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
const myListSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
exports.feedbackRouter.get("/my", auth_1.requireAuth, async (request, response) => {
    const parsed = myListSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user?.id ?? (env_1.env.devAuthBypass ? "dev-mock-id" : undefined);
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    try {
        const result = await store_1.feedbackStore.list({
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
    }
    catch (error) {
        logger_1.logger.error("feedback.my.list.failed", { userId, stage: "my_list", error });
        response.status(500).json({ message: "查询失败" });
    }
});
exports.feedbackRouter.post("/", auth_1.requireAuth, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user?.id ?? (env_1.env.devAuthBypass ? "dev-mock-id" : undefined);
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    logger_1.logger.info("feedback.submit.start", {
        userId,
        pageRoute: parsed.data.pageRoute,
        pageTitle: parsed.data.pageTitle,
        type: parsed.data.type,
        stage: "create",
    });
    try {
        const item = await store_1.feedbackStore.create({
            userId,
            type: parsed.data.type,
            content: parsed.data.content,
            contact: parsed.data.contact,
            pageRoute: parsed.data.pageRoute,
            pageTitle: parsed.data.pageTitle,
            source: "web_feedback",
        });
        logger_1.logger.info("feedback.submit.success", {
            userId,
            feedbackId: item.id,
            pageRoute: item.pageRoute,
            type: item.type,
            stage: "create",
        });
        await (0, store_1.recordAnalyticsEventSafely)({
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
    }
    catch (error) {
        logger_1.logger.error("feedback.submit.failed", {
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
const patchSchema = zod_1.z
    .object({
    status: zod_1.z
        .enum(["pending", "evaluating", "snoozed", "approved", "in_progress", "testing", "deployed", "verified", "failed_testing", "reverted", "wontfix", "duplicate"])
        .optional(),
    adminNote: zod_1.z.string().trim().max(5000).optional(),
})
    .refine((data) => data.status || data.adminNote !== undefined, {
    message: "至少需要提供 status 或 adminNote",
});
exports.feedbackRouter.patch("/admin/:id", auth_1.requireFeedbackReader, async (req, res) => {
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
            const evalResult = await (0, db_1.query)(`SELECT suggested_action, suggestion FROM feedback_evaluations WHERE feedback_id = $1 ORDER BY evaluated_at DESC LIMIT 1`, [feedbackId]);
            if (evalResult.rows.length === 0) {
                // Block approval without AI evaluation — pipeline (fb-dispatch.sh) requires it
                logger_1.logger.warn("feedback.approve.blocked.no_evaluation", { feedbackId, stage: "approve" });
                res.status(400).json({
                    message: "请等待 AI 评估完成后再审批，当前尚无评估记录",
                    code: "EVALUATION_REQUIRED",
                });
                return;
            }
            const ev = evalResult.rows[0];
            if (ev.suggested_action === "auto_fix") {
                // auto_fix → keep "approved", bash pipeline (fb-dispatch.sh) handles grouping + scoring + dispatch to fb-ai-web
                logger_1.logger.info("feedback.approve.auto_fix", { feedbackId, stage: "approve", note: "delegated to bash pipeline" });
            }
            // batch_review / human_gate → keep "approved" (frontend groups them correctly)
            logger_1.logger.info("feedback.approve.success", { feedbackId, suggestedAction: ev.suggested_action, stage: "approve" });
        }
        catch (error) {
            logger_1.logger.error("feedback.approve.eval_lookup.failed", { feedbackId, error, stage: "approve" });
            res.status(500).json({ message: "评估查询失败，请稍后重试" });
            return;
        }
    }
    // Default update path (non-approved statuses, or approval without evaluation)
    const updateInput = {};
    if (status)
        updateInput.status = status;
    if (adminNote !== undefined)
        updateInput.adminNote = adminNote;
    const updated = await store_1.feedbackStore.update(feedbackId, updateInput);
    if (!updated) {
        res.status(404).json({ message: "反馈记录不存在" });
        return;
    }
    res.json(updated);
});
// --- Public feedback wall ---
const publicListSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    sort: zod_1.z.enum(["recent", "popular"]).default("recent"),
});
exports.feedbackRouter.get("/public", async (request, response) => {
    const parsed = publicListSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    try {
        const currentUserId = request.session.user?.id ?? undefined;
        const result = await store_1.feedbackLikeStore.listPublic({
            ...parsed.data,
            currentUserId,
        });
        response.json({ items: result.items, total: result.total });
    }
    catch (error) {
        logger_1.logger.error("feedback.public.list.failed", { error });
        response.status(500).json({ message: "查询失败" });
    }
});
exports.feedbackRouter.post("/public/:id/like", auth_1.requireAuth, async (request, response) => {
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    try {
        const feedbackId = String(request.params.id);
        await store_1.feedbackLikeStore.like(feedbackId, userId);
        const likeCount = await store_1.feedbackLikeStore.getLikeCount(feedbackId);
        response.json({ likedByMe: true, likeCount });
    }
    catch (error) {
        logger_1.logger.error("feedback.public.like.failed", { error });
        response.status(500).json({ message: "点赞失败" });
    }
});
exports.feedbackRouter.delete("/public/:id/like", auth_1.requireAuth, async (request, response) => {
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    try {
        const feedbackId = String(request.params.id);
        await store_1.feedbackLikeStore.unlike(feedbackId, userId);
        const likeCount = await store_1.feedbackLikeStore.getLikeCount(feedbackId);
        response.json({ likedByMe: false, likeCount });
    }
    catch (error) {
        logger_1.logger.error("feedback.public.unlike.failed", { error });
        response.status(500).json({ message: "取消点赞失败" });
    }
});
// --- Internal API (feedback pipeline) ---
const internalEvaluationSchema = zod_1.z.object({
    evaluations: zod_1.z.array(zod_1.z.object({
        feedback_id: zod_1.z.string().uuid(),
        eval_type: zod_1.z.string().min(1),
        severity: zod_1.z.string().min(1),
        fix_scope: zod_1.z.string().min(1),
        alignment: zod_1.z.string().min(1),
        suggested_action: zod_1.z.string().min(1),
        suggestion: zod_1.z.string().optional(),
    })).min(1),
});
exports.feedbackRouter.post("/internal/evaluations", auth_1.requireAdminOrFeedbackWriteToken, async (request, response) => {
    const parsed = internalEvaluationSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    logger_1.logger.info("feedback.internal.evaluations.start", {
        count: parsed.data.evaluations.length,
        stage: "internal_evaluate",
    });
    try {
        const result = await (0, db_1.withTransaction)(async (client) => {
            let inserted = 0;
            let statusUpdated = 0;
            for (const item of parsed.data.evaluations) {
                await client.query(`INSERT INTO feedback_evaluations (feedback_id, eval_type, severity, fix_scope, alignment, suggested_action, suggestion)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (feedback_id) DO UPDATE SET
               eval_type = EXCLUDED.eval_type,
               severity = EXCLUDED.severity,
               fix_scope = EXCLUDED.fix_scope,
               alignment = EXCLUDED.alignment,
               suggested_action = EXCLUDED.suggested_action,
               suggestion = EXCLUDED.suggestion,
               evaluated_at = NOW()`, [item.feedback_id, item.eval_type, item.severity, item.fix_scope, item.alignment, item.suggested_action, item.suggestion ?? null]);
                inserted++;
                const updateResult = await client.query(`UPDATE feedback_entries SET status = 'evaluating' WHERE id = $1 AND status = 'pending'`, [item.feedback_id]);
                if ((updateResult.rowCount ?? 0) > 0) {
                    statusUpdated++;
                }
            }
            return { inserted, statusUpdated };
        });
        logger_1.logger.info("feedback.internal.evaluations.success", {
            inserted: result.inserted,
            statusUpdated: result.statusUpdated,
            stage: "internal_evaluate",
        });
        response.json({ ok: true, ...result });
    }
    catch (error) {
        logger_1.logger.error("feedback.internal.evaluations.failed", { stage: "internal_evaluate", error });
        response.status(500).json({ message: "评估写入失败" });
    }
});
const batchStatusSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid(),
        status: zod_1.z.enum(["in_progress", "testing", "fixed", "deployed", "verified", "failed_testing", "wontfix"]),
    })).min(1),
});
exports.feedbackRouter.patch("/internal/batch-status", auth_1.requireAdminOrFeedbackWriteToken, async (request, response) => {
    const parsed = batchStatusSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    logger_1.logger.info("feedback.internal.batch-status.start", {
        count: parsed.data.items.length,
        stage: "internal_batch_status",
    });
    try {
        const updated = await (0, db_1.withTransaction)(async (client) => {
            let count = 0;
            for (const item of parsed.data.items) {
                const result = await client.query(`UPDATE feedback_entries SET status = $1 WHERE id = $2`, [item.status, item.id]);
                count += result.rowCount ?? 0;
            }
            return count;
        });
        logger_1.logger.info("feedback.internal.batch-status.success", {
            updated,
            stage: "internal_batch_status",
        });
        response.json({ ok: true, updated });
    }
    catch (error) {
        logger_1.logger.error("feedback.internal.batch-status.failed", { stage: "internal_batch_status", error });
        response.status(500).json({ message: "状态更新失败" });
    }
});
