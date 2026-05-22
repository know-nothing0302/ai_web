"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const env_1 = require("../config/env");
const app_1 = require("../app");
const run = async () => {
    env_1.env.devAuthBypass = true;
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}/api/page-agent`;
        const createResponse = await fetch(`${baseUrl}/conversations`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                pageType: "article_detail",
                route: "/articles/mock-id",
                pageTitle: "文章详情",
            }),
        });
        strict_1.default.equal(createResponse.status, 200);
        const conversation = await createResponse.json();
        strict_1.default.equal(typeof conversation.id, "string");
        const qaResponse = await fetch(`${baseUrl}/qa`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                conversationId: conversation.id,
                question: "这篇文章讲什么？",
                pageType: "article_detail",
                route: "/articles/mock-id",
                pageTitle: "文章详情",
                selectionText: "",
                context: {
                    articleId: "mock-id",
                    title: "医学 AI 研究进展",
                    summary: "文章讨论了医学 AI 在教学与科研中的应用。",
                    contentPreview: "医学 AI 正在用于辅助教学、科研分析和知识服务。",
                },
            }),
        });
        strict_1.default.equal(qaResponse.status, 200);
        const qaResult = await qaResponse.json();
        strict_1.default.equal(qaResult.conversationId, conversation.id);
        const listResponse = await fetch(`${baseUrl}/conversations`);
        strict_1.default.equal(listResponse.status, 200);
        const listResult = await listResponse.json();
        strict_1.default.equal(Array.isArray(listResult.items), true);
        const messagesResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/messages`);
        strict_1.default.equal(messagesResponse.status, 200);
        const messages = await messagesResponse.json();
        strict_1.default.equal(Array.isArray(messages.items), true);
        const assistantMessage = messages.items.find((item) => item.role === "assistant");
        strict_1.default.equal(typeof assistantMessage?.id, "string");
        const feedbackResponse = await fetch(`${baseUrl}/messages/${assistantMessage.id}/feedback`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                score: 1,
                tag: "回答清晰",
                content: "希望以后多给步骤",
            }),
        });
        strict_1.default.equal(feedbackResponse.status, 200);
    }
    finally {
        server.close();
    }
};
void run();
