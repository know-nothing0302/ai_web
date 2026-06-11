import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { analyticsEventStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.statsExternalReadToken = "stats-read-token";
  env.devAuthBypass = false;

  await initDb();
  await analyticsEventStore.create({
    eventType: "page",
    eventName: "page_view",
    userId: "u-2",
    pageRoute: "/",
    pageTitle: "AI在徐医",
    sourceModule: "test",
  });
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/stats/external/overview`;

    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const forbidden = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "wrong-token",
      },
    });
    assert.equal(forbidden.status, 403);

    const success = await fetch(baseUrl, {
      headers: {
        "x-internal-auth-token": "stats-read-token",
      },
    });
    assert.equal(success.status, 200);

    const body = await success.json();
    assert.equal(body.pv >= 1, true);
    assert.equal(body.generatedAt.length > 0, true);
    assert.equal("enabledSubscriptionCount" in body, false);

    const trends = await fetch(
      `http://127.0.0.1:${address.port}/api/stats/external/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`,
      {
        headers: {
          "x-internal-auth-token": "stats-read-token",
        },
      }
    );
    assert.equal(trends.status, 200);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
