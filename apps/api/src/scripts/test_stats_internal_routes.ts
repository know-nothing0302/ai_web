import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { analyticsEventStore, articleStore, subscriptionStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  await initDb();

  const article = await articleStore.create({
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

  await analyticsEventStore.create({
    eventType: "page",
    eventName: "page_view",
    userId: "u-1",
    pageRoute: "/",
    pageTitle: "AI徐医",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "article",
    eventName: "article_view",
    userId: "u-1",
    articleId: article.id,
    channelCode: "daily-ai-summary",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "article",
    eventName: "article_published",
    userId: "u-1",
    articleId: article.id,
    channelCode: "daily-ai-summary",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "push",
    eventName: "push_sent",
    userId: "u-1",
    articleId: article.id,
    channelCode: "daily-ai-summary",
    sourceModule: "test",
  });
  await analyticsEventStore.create({
    eventType: "feedback",
    eventName: "feedback_created",
    userId: "u-1",
    sourceModule: "test",
    eventPayload: {
      type: "bug",
    },
  });
  await subscriptionStore.upsertByUser("u-1", {
    channelCodes: ["daily-ai-summary"],
    categories: ["每日AI摘要"],
    frequency: "daily",
    qywxUserId: "u-1",
    qywxUserName: "User 1",
    enabled: true,
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/stats/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.pv >= 1, true);
    assert.equal(body.uv >= 1, true);
    assert.equal(body.articleViews >= 1, true);
    assert.equal(body.feedbackCount >= 1, true);
    assert.equal(body.enabledSubscriptionCount >= 1, true);

    const trends = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`
    );
    assert.equal(trends.status, 200);

    const distributions = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/distributions?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`
    );
    assert.equal(distributions.status, 200);
    const distributionsBody = await distributions.json();
    assert.equal(Array.isArray(distributionsBody.channelViews.items), true);
    assert.equal("feedbackTypes" in distributionsBody, true);

    const rankings = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/rankings?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z&limit=5`
    );
    assert.equal(rankings.status, 200);
    const rankingsBody = await rankings.json();
    assert.equal(Array.isArray(rankingsBody.topArticles.items), true);
    assert.equal(Array.isArray(rankingsBody.topChannels.items), true);
    assert.equal("topArticles" in rankingsBody, true);

    const status = await fetch(`http://127.0.0.1:${address.port}/api/stats/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(typeof statusBody.totalEvents, "number");
    assert.equal(typeof statusBody.todayEventCount, "number");
    assert.equal("latestEventAt" in statusBody, true);
    assert.equal(statusBody.totalEvents >= 1, true);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
