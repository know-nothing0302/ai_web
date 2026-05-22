"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const env_1 = require("../config/env");
const app_1 = require("../app");
const db_1 = require("../lib/db");
const run = async () => {
    env_1.env.devAuthBypass = true;
    await (0, db_1.initDb)();
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}/api/feedback`;
        const createResponse = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                type: "ux",
                content: "右侧反馈入口很好找，但希望提交成功后提示更轻一点。",
                contact: "tester@example.com",
                pageRoute: "/articles/mock-id",
                pageTitle: "文章详情",
            }),
        });
        strict_1.default.equal(createResponse.status, 201);
        const created = await createResponse.json();
        strict_1.default.equal(created.type, "ux");
        strict_1.default.equal(created.pageRoute, "/articles/mock-id");
        const invalidResponse = await fetch(baseUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                type: "ux",
                content: "",
                pageRoute: "/articles/mock-id",
                pageTitle: "文章详情",
            }),
        });
        strict_1.default.equal(invalidResponse.status, 400);
    }
    finally {
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
