import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { feedbackStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.feedbackExternalReadToken = "feedback-read-token";
  env.devAuthBypass = false;

  await initDb();

  const windowStart = new Date(Date.now() - 1_000).toISOString();
  const expectedContent = `反馈外部读取验证-${Date.now()}`;

  await feedbackStore.create({
    userId: "tester-1",
    type: "ux",
    content: expectedContent,
    contact: "tester@example.com",
    pageRoute: "/articles/alpha",
    pageTitle: "文章详情",
    source: "web_feedback",
  });

  await feedbackStore.create({
    userId: "tester-2",
    type: "bug",
    content: `反馈外部读取缺陷验证-${Date.now()}`,
    contact: "ops@example.com",
    pageRoute: "/articles/beta",
    pageTitle: "列表页",
    source: "web_feedback",
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/feedback/external`;

    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const forbidden = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "wrong-token",
      },
    });
    assert.equal(forbidden.status, 403);

    const success = await fetch(
      `${baseUrl}?type=ux&startAt=${encodeURIComponent(windowStart)}&page=1&pageSize=10`,
      {
        headers: {
          "x-internal-auth-token": "feedback-read-token",
        },
      }
    );
    assert.equal(success.status, 200);

    const body = await success.json();
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.pageSize, 10);
    assert.ok(body.pagination.total >= 1);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.some((item: { content: string; type: string; contact?: string }) => {
      return (
        item.content === expectedContent &&
        item.type === "ux" &&
        item.contact === "tester@example.com"
      );
    }));
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
