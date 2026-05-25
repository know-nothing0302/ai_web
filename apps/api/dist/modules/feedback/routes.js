"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
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
exports.feedbackRouter.get("/admin", auth_1.requireFeedbackReader, async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    logger_1.logger.info("feedback.admin.read.start", {
        type: parsed.data.type,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        stage: "list",
    });
    try {
        const result = await store_1.feedbackStore.list(parsed.data);
        logger_1.logger.info("feedback.admin.read.success", {
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
        logger_1.logger.error("feedback.admin.read.failed", {
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
        .enum(["pending", "in_progress", "optimized", "implemented", "wontfix", "duplicate"])
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
    const updated = await store_1.feedbackStore.update(req.params.id, parsed.data);
    if (!updated) {
        res.status(404).json({ message: "反馈记录不存在" });
        return;
    }
    res.json(updated);
});
