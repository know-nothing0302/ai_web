import { Router } from "express";
import { z } from "zod";

import {
  requireAuth,
  requireStatsReader,
  requireAdminOrStatsExternalReadToken,
} from "../../middleware/auth";
import { recordAnalyticsEventSafely } from "../../lib/store";
import { statsService } from "./service";

const overviewQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  channelCode: z.string().trim().min(1).optional(),
});

const trendQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
});

const rankingQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

const pageEventSchema = z.object({
  pageRoute: z.string().trim().min(1).max(500),
  pageTitle: z.string().trim().min(1).max(200),
});

const articleEventSchema = pageEventSchema.extend({
  articleId: z.uuid(),
  channelCode: z.string().trim().min(1).max(64),
});

export const statsRouter = Router();

statsRouter.post("/events/page-view", async (request, response) => {
  const parsed = pageEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id;
  await recordAnalyticsEventSafely({
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

statsRouter.post("/events/article-view", requireAuth, async (request, response) => {
  const parsed = articleEventSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = request.session.user?.id;
  await recordAnalyticsEventSafely({
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

statsRouter.get("/overview", requireStatsReader, async (request, response) => {
  const parsed = overviewQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const summary = await statsService.getOverview(parsed.data);
  response.json(summary);
});

statsRouter.get("/trends", requireStatsReader, async (request, response) => {
  const parsed = trendQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json({
    items: await statsService.getDailyTrend(parsed.data),
  });
});

statsRouter.get("/distributions", requireStatsReader, async (request, response) => {
  const parsed = trendQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json(await statsService.getDistributions(parsed.data));
});

statsRouter.get("/rankings", requireStatsReader, async (request, response) => {
  const parsed = rankingQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  response.json(await statsService.getRankings(parsed.data));
});

statsRouter.get("/status", requireStatsReader, async (_request, response) => {
  response.json(await statsService.getStatus());
});

statsRouter.get(
  "/external/overview",
  requireAdminOrStatsExternalReadToken,
  async (request, response) => {
    const parsed = overviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    const summary = await statsService.getOverview(parsed.data);
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
  }
);

statsRouter.get(
  "/external/trends",
  requireAdminOrStatsExternalReadToken,
  async (request, response) => {
    const parsed = trendQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    response.json({
      items: await statsService.getDailyTrend(parsed.data),
      generatedAt: new Date().toISOString(),
    });
  }
);
