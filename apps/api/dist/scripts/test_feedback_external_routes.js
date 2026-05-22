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
    env_1.env.feedbackExternalReadToken = "feedback-read-token";
    env_1.env.devAuthBypass = false;
    await (0, db_1.initDb)();
    const windowStart = new Date(Date.now() - 1_000).toISOString();
    const expectedContent = `反馈外部读取验证-${Date.now()}`;
    await store_1.feedbackStore.create({
        userId: "tester-1",
        type: "ux",
        content: expectedContent,
        contact: "tester@example.com",
        pageRoute: "/articles/alpha",
        pageTitle: "文章详情",
        source: "web_feedback",
    });
    await store_1.feedbackStore.create({
        userId: "tester-2",
        type: "bug",
        content: `反馈外部读取缺陷验证-${Date.now()}`,
        contact: "ops@example.com",
        pageRoute: "/articles/beta",
        pageTitle: "列表页",
        source: "web_feedback",
    });
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}/api/feedback/external`;
        const unauthorized = await fetch(baseUrl);
        strict_1.default.equal(unauthorized.status, 401);
        const forbidden = await fetch(baseUrl, {
            headers: {
                "x-internal-auth-token": "wrong-token",
            },
        });
        strict_1.default.equal(forbidden.status, 403);
        const success = await fetch(`${baseUrl}?type=ux&startAt=${encodeURIComponent(windowStart)}&page=1&pageSize=10`, {
            headers: {
                "x-internal-auth-token": "feedback-read-token",
            },
        });
        strict_1.default.equal(success.status, 200);
        const body = await success.json();
        strict_1.default.equal(body.pagination.page, 1);
        strict_1.default.equal(body.pagination.pageSize, 10);
        strict_1.default.ok(body.pagination.total >= 1);
        strict_1.default.ok(Array.isArray(body.items));
        strict_1.default.ok(body.items.some((item) => {
            return (item.content === expectedContent &&
                item.type === "ux" &&
                item.contact === "tester@example.com");
        }));
    }
    finally {
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
