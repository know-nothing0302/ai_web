"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const store_1 = require("../lib/store");
const service_1 = require("../modules/page_agent/service");
const run = async () => {
    const userId = `plan-flow-${Date.now()}`;
    const conversation = await store_1.pageAgentConversationStore.create({
        userId,
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
    });
    await store_1.userProfileStore.upsertByUser(userId, {
        profileVersion: 1,
        preferenceSummary: "偏好结构化、步骤化回答",
        personaPrompt: "回答时先给结论，再给步骤，必要时补充示例。",
        interestTopics: ["医学AI", "政策解读"],
        responsePreferences: {
            style: "structured",
            preferExamples: true,
        },
        evidenceStats: {
            questionCount: 2,
        },
    });
    const first = await (0, service_1.answerPageQuestion)({
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
            sourceContent: "医学 AI 正在用于辅助教学、科研分析和知识服务，并覆盖课程设计、科研辅助、临床知识整理、病例推演与院校协同创新等多个具体场景。",
            channelCode: "medical-frontier",
            channelName: "医学前沿",
        },
    }, userId);
    strict_1.default.equal(first.conversationId, conversation.id);
    strict_1.default.equal(typeof first.answer, "string");
    strict_1.default.equal(Array.isArray(first.sources), true);
    strict_1.default.equal(first.meta.usedCurrentPage, true);
    strict_1.default.equal(first.meta.usedSiteSearch, false);
    strict_1.default.equal(first.meta.usedHistory, false);
    strict_1.default.equal(first.meta.usedUserProfile, true);
    const second = await (0, service_1.answerPageQuestion)({
        conversationId: conversation.id,
        question: "再结合上一问，给我一个三点总结。",
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
        selectionText: "",
        context: {
            articleId: "mock-id",
            title: "医学 AI 研究进展",
            summary: "文章讨论了医学 AI 在教学与科研中的应用。",
            contentPreview: "医学 AI 正在用于辅助教学、科研分析和知识服务。",
            sourceContent: "医学 AI 正在用于辅助教学、科研分析和知识服务，并覆盖课程设计、科研辅助、临床知识整理、病例推演与院校协同创新等多个具体场景。",
            channelCode: "medical-frontier",
            channelName: "医学前沿",
        },
    }, userId);
    strict_1.default.equal(second.conversationId, conversation.id);
    strict_1.default.equal(second.meta.usedHistory, true);
    strict_1.default.equal(second.meta.usedUserProfile, true);
};
void run();
