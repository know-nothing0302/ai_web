"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const store_js_1 = require("../lib/store.js");
const profile_service_js_1 = require("../modules/page_agent/profile_service.js");
const run = async () => {
    const userId = `plan-profile-${Date.now()}`;
    await store_js_1.subscriptionStore.upsertByUser(userId, {
        channelCodes: ["medical-frontier", "policy-ethics"],
        categories: ["医学AI前沿", "AI政策与伦理"],
        frequency: "daily",
        qywxUserId: userId,
        qywxUserName: "plan-user",
        enabled: true,
    });
    const conversation = await store_js_1.pageAgentConversationStore.create({
        userId,
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
    });
    await store_js_1.pageAgentMessageStore.create({
        conversationId: conversation.id,
        userId,
        role: "user",
        messageType: "question",
        content: "请结合政策背景解释这篇文章。",
        sanitizedContent: "请结合政策背景解释这篇文章。",
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
        contextPayload: {},
        sourcesPayload: [],
    });
    await store_js_1.pageAgentMessageStore.create({
        conversationId: conversation.id,
        userId,
        role: "feedback",
        messageType: "feedback",
        content: "希望多给步骤和示例。",
        sanitizedContent: "希望多给步骤和示例。",
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
        contextPayload: {},
        sourcesPayload: [],
        feedbackScore: 1,
        feedbackTag: "更具体",
    });
    const job = await (0, profile_service_js_1.runUserProfileAnalysisJob)({
        triggerMode: "manual",
        targetUserId: userId,
    });
    strict_1.default.equal(job.status, "success");
    const profile = await store_js_1.userProfileStore.getByUserId(userId);
    strict_1.default.equal(typeof profile?.personaPrompt, "string");
    strict_1.default.equal((profile?.personaPrompt.length ?? 0) <= 500, true);
};
void run();
