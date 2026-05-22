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
    env_1.env.statsExternalReadToken = "stats-read-token";
    env_1.env.devAuthBypass = false;
    await (0, db_1.initDb)();
    await store_1.analyticsEventStore.create({
        eventType: "page",
        eventName: "page_view",
        userId: "u-2",
        pageRoute: "/",
        pageTitle: "AI徐医",
        sourceModule: "test",
    });
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}/api/stats/external/overview`;
        const unauthorized = await fetch(baseUrl);
        strict_1.default.equal(unauthorized.status, 401);
        const forbidden = await fetch(baseUrl, {
            headers: {
                "x-internal-auth-token": "wrong-token",
            },
        });
        strict_1.default.equal(forbidden.status, 403);
        const success = await fetch(baseUrl, {
            headers: {
                "x-internal-auth-token": "stats-read-token",
            },
        });
        strict_1.default.equal(success.status, 200);
        const body = await success.json();
        strict_1.default.equal(body.pv >= 1, true);
        strict_1.default.equal(body.generatedAt.length > 0, true);
        strict_1.default.equal("enabledSubscriptionCount" in body, false);
        const trends = await fetch(`http://127.0.0.1:${address.port}/api/stats/external/trends?startAt=2026-01-01T00:00:00.000Z&endAt=2026-12-31T23:59:59.000Z`, {
            headers: {
                "x-internal-auth-token": "stats-read-token",
            },
        });
        strict_1.default.equal(trends.status, 200);
    }
    finally {
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
