"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../../middleware/auth");
const store_1 = require("../../lib/store");
const service_1 = require("./service");
const overviewQuerySchema = zod_1.z.object({
    startAt: zod_1.z.string().datetime({ offset: true }).optional(),
    endAt: zod_1.z.string().datetime({ offset: true }).optional(),
    channelCode: zod_1.z.string().trim().min(1).optional(),
});
const trendQuerySchema = zod_1.z.object({
    startAt: zod_1.z.string().datetime({ offset: true }),
    endAt: zod_1.z.string().datetime({ offset: true }),
});
const rankingQuerySchema = zod_1.z.object({
    startAt: zod_1.z.string().datetime({ offset: true }),
    endAt: zod_1.z.string().datetime({ offset: true }),
    limit: zod_1.z.coerce.number().int().min(1).max(20).default(5),
});
const pageEventSchema = zod_1.z.object({
    pageRoute: zod_1.z.string().trim().min(1).max(500),
    pageTitle: zod_1.z.string().trim().min(1).max(200),
});
const articleEventSchema = pageEventSchema.extend({
    articleId: zod_1.z.uuid(),
    channelCode: zod_1.z.string().trim().min(1).max(64),
});
exports.statsRouter = (0, express_1.Router)();
exports.statsRouter.post("/events/page-view", auth_1.requireAuth, async (request, response) => {
    const parsed = pageEventSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user?.id;
    await (0, store_1.recordAnalyticsEventSafely)({
        eventType: "page",
        eventName: "page_view",
        userId,
        sessionId: request.sessionID,
        pageRoute: parsed.data.pageRoute,
        pageTitle: parsed.data.pageTitle,
        sourceModule: "stats.routes",
    });
    response.status(204).send();
});
exports.statsRouter.post("/events/article-view", auth_1.requireAuth, async (request, response) => {
    const parsed = articleEventSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user?.id;
    await (0, store_1.recordAnalyticsEventSafely)({
        eventType: "article",
        eventName: "article_view",
        userId,
        sessionId: request.sessionID,
        pageRoute: parsed.data.pageRoute,
        pageTitle: parsed.data.pageTitle,
        articleId: parsed.data.articleId,
        channelCode: parsed.data.channelCode,
        sourceModule: "stats.routes",
    });
    response.status(204).send();
});
exports.statsRouter.get("/overview", auth_1.requireStatsReader, async (request, response) => {
    const parsed = overviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const summary = await service_1.statsService.getOverview(parsed.data);
    response.json(summary);
});
exports.statsRouter.get("/trends", auth_1.requireStatsReader, async (request, response) => {
    const parsed = trendQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    response.json({
        items: await service_1.statsService.getDailyTrend(parsed.data),
    });
});
exports.statsRouter.get("/distributions", auth_1.requireStatsReader, async (request, response) => {
    const parsed = trendQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    response.json(await service_1.statsService.getDistributions(parsed.data));
});
exports.statsRouter.get("/rankings", auth_1.requireStatsReader, async (request, response) => {
    const parsed = rankingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    response.json(await service_1.statsService.getRankings(parsed.data));
});
exports.statsRouter.get("/status", auth_1.requireStatsReader, async (_request, response) => {
    response.json(await service_1.statsService.getStatus());
});
exports.statsRouter.get("/external/overview", auth_1.requireAdminOrStatsExternalReadToken, async (request, response) => {
    const parsed = overviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const summary = await service_1.statsService.getOverview(parsed.data);
    response.json({
        pv: summary.pv,
        uv: summary.uv,
        articleViews: summary.articleViews,
        articlesPublished: summary.articlesPublished,
        pushTotal: summary.pushTotal,
        pushSuccess: summary.pushSuccess,
        pushFailed: summary.pushFailed,
        pushSuccessRate: summary.pushSuccessRate,
        feedbackCount: summary.feedbackCount,
        pageAgentConversationCount: summary.pageAgentConversationCount,
        pageAgentMessageCount: summary.pageAgentMessageCount,
        generatedAt: new Date().toISOString(),
    });
});
exports.statsRouter.get("/external/trends", auth_1.requireAdminOrStatsExternalReadToken, async (request, response) => {
    const parsed = trendQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    response.json({
        items: await service_1.statsService.getDailyTrend(parsed.data),
        generatedAt: new Date().toISOString(),
    });
});
