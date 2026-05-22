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
    await store_1.feedbackStore.create({
        userId: "100002013029",
        type: "bug",
        content: "统计页反馈详情测试",
        contact: "wechat:test",
        pageRoute: "/admin/stats",
        pageTitle: "统计信息",
        source: "test",
    });
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/feedback/admin?page=1&pageSize=10`);
        strict_1.default.equal(response.status, 200);
        const body = await response.json();
        strict_1.default.equal(Array.isArray(body.items), true);
        strict_1.default.equal(body.items.length >= 1, true);
        strict_1.default.equal(body.items[0].content, "统计页反馈详情测试");
        strict_1.default.equal(body.items[0].pageTitle, "统计信息");
        strict_1.default.equal(body.pagination.page, 1);
        strict_1.default.equal(body.pagination.pageSize, 10);
    }
    finally {
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
