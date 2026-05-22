"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const db_1 = require("../lib/db");
const store_1 = require("../lib/store");
const run = async () => {
    await (0, db_1.initDb)();
    const userId = `plan-store-${Date.now()}`;
    const conversation = await store_1.pageAgentConversationStore.create({
        userId,
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
    });
    strict_1.default.equal(conversation.userId, userId);
    await store_1.pageAgentMessageStore.create({
        conversationId: conversation.id,
        userId,
        role: "user",
        messageType: "question",
        content: "第一问",
        sanitizedContent: "第一问",
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
        contextPayload: {},
        sourcesPayload: [],
    });
    const history = await store_1.pageAgentMessageStore.listRecentByConversation(conversation.id, 10);
    strict_1.default.equal(history.length, 1);
    const profile = await store_1.userProfileStore.upsertByUser(userId, {
        profileVersion: 1,
        preferenceSummary: "偏好结构化回答",
        personaPrompt: "回答时先给结论，再给步骤。",
        interestTopics: ["医学AI"],
        responsePreferences: {
            style: "structured",
        },
        evidenceStats: {
            questionCount: 1,
        },
    });
    strict_1.default.equal(profile.userId, userId);
};
void run();
