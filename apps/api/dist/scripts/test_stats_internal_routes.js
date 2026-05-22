"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const app_1 = require("../app");
const env_1 = require("../config/env");
const db_1 = require("../lib/db");
const store_1 = require("../lib/store");
const run = async () => {
    env_1.env.devAuthBypass = true;
    await (0, db_1.initDb)();
    const article = await store_1.articleStore.create({
        createdByUserId: "u-1",
        title: "统计看板测试文章",
        summary: "用于验证热门文章排行",
        content: "测试内容",
        channelCode: "daily-ai-summary",
        category: "每日AI摘要",
        tags: [],
        status: "published",
        author: "Test User",
        publishedAt: "2026-05-18T08:00:00.000Z",
    });
    await store_1.analyticsEventStore.create({
        eventType: "page",
        eventName: "page_view",
        userId: "u-1",
        pageRoute: "/",
        pageTitle: "AI徐医",
        sourceModule: "test",
    });
    await store_1.analyticsEventStore.create({
        eventType: "article",
        eventName: "article_view",
        userId: "u-1",
        articleId: article.id,
        channelCode: "daily-ai-summary",
        sourceModule: "test",
    });
    await store_1.analyticsEventStore.create({
        eventType: "article",
        eventName: "article_published",
        userId: "u-1",
        articleId: article.id,
        channelCode: "daily-ai-summary",
        sourceModule: "test",
    });
    await store_1.analyticsEventStore.create({
        eventType: "push",
        eventName: "push_sent",
        userId: "u-1",
        articleId: article.id,
        channelCode: "daily-ai-summary",
        sourceModule: "test",
    });
    await store_1.analyticsEventStore.create({
        eventType: "feedback",
        eventName: "feedback_created",
        userId: "u-1",
        sourceModule: "test",
        eventPayload: {
            type: "bug",
        },
    });
    await store_1.subscriptionStore.upsertByUser("u-1", {
        channelCodes: ["daily-ai-summary"],
        categories: ["每日AI摘要"],
        frequency: "daily",
        qywxUserId: "u-1",
        qywxUserName: "User 1",
        enabled: true,
    });
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/stats/overview`);
        strict_1.default.equal(response.status, 200);
        const body = await response.json();
        strict_1.default.equal(body.pv >= 1, true);
        strict_1.default.equal(body.uv >= 1, true);
        strict_1.default.equal(body.articleViews >= 1, true);
        strict_1.default.equal(body.feedbackCount >= 1, true);
        strict_1.default.equal(body.enabledSubscriptionCount >= 1, true);
        const trends = await fetch(`http://127.0.0.1:${address.port}/api/stats/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`);
        strict_1.default.equal(trends.status, 200);
        const distributions = await fetch(`http://127.0.0.1:${address.port}/api/stats/distributions?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`);
        strict_1.default.equal(distributions.status, 200);
        const distributionsBody = await distributions.json();
        strict_1.default.equal(Array.isArray(distributionsBody.channelViews.items), true);
        strict_1.default.equal("feedbackTypes" in distributionsBody, true);
        const rankings = await fetch(`http://127.0.0.1:${address.port}/api/stats/rankings?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z&limit=5`);
        strict_1.default.equal(rankings.status, 200);
        const rankingsBody = await rankings.json();
        strict_1.default.equal(Array.isArray(rankingsBody.topArticles.items), true);
        strict_1.default.equal(Array.isArray(rankingsBody.topChannels.items), true);
        strict_1.default.equal("topArticles" in rankingsBody, true);
        const status = await fetch(`http://127.0.0.1:${address.port}/api/stats/status`);
        strict_1.default.equal(status.status, 200);
        const statusBody = await status.json();
        strict_1.default.equal(typeof statusBody.totalEvents, "number");
        strict_1.default.equal(typeof statusBody.todayEventCount, "number");
        strict_1.default.equal("latestEventAt" in statusBody, true);
        strict_1.default.equal(statusBody.totalEvents >= 1, true);
    }
    finally {
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
