"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUserProfileAnalysisJob = void 0;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const store_1 = require("../../lib/store");
const sanitize_1 = require("./sanitize");
const profile_prompts_1 = require("./profile_prompts");
const profileOutputSchema = zod_1.z.object({
    preferenceSummary: zod_1.z.string().trim().default(""),
    interestTopics: zod_1.z.array(zod_1.z.string().trim()).default([]),
    responsePreferences: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    personaPrompt: zod_1.z.string().trim().max(500).default(""),
    confidence: zod_1.z.enum(["low", "medium", "high"]).default("low"),
});
const buildFallbackProfile = (input) => {
    const interestTopics = [...new Set(input.channelCodes)].slice(0, 3);
    return {
        preferenceSummary: input.recentFeedback.length > 0
            ? "用户倾向于更具体、结构化的回答。"
            : "用户偏好需要结合后续提问和反馈继续观察。",
        interestTopics,
        responsePreferences: {
            style: "structured",
        },
        personaPrompt: input.recentFeedback.length > 0
            ? "回答时优先分点说明，先给结论，再给步骤，必要时补充示例。"
            : "回答时保持简洁清晰，必要时分点说明。",
        confidence: "low",
    };
};
const runUserProfileAnalysisJob = async (input) => {
    const job = await store_1.userProfileAnalysisJobStore.create({
        triggerMode: input.triggerMode,
        targetUserId: input.targetUserId,
    });
    try {
        await store_1.userProfileAnalysisJobStore.markRunning(job.id);
        const userIds = input.targetUserId
            ? [input.targetUserId]
            : await store_1.pageAgentMessageStore.listDistinctUserIdsForProfileAnalysis(50);
        let processedCount = 0;
        let successCount = 0;
        for (const userId of userIds) {
            const subscriptions = await store_1.subscriptionStore.listByUser(userId);
            const messages = await store_1.pageAgentMessageStore.listRecentByUser(userId, 30);
            const recentQuestions = messages
                .filter((item) => item.role === "user")
                .map((item) => (0, sanitize_1.sanitizeForModel)(item.content))
                .slice(-10);
            const recentFeedback = messages
                .filter((item) => item.role === "feedback")
                .map((item) => ({
                score: item.feedbackScore,
                tag: item.feedbackTag,
                content: (0, sanitize_1.sanitizeForModel)(item.content),
            }))
                .slice(-10);
            const payload = {
                subscriptions: {
                    channelCodes: subscriptions.flatMap((item) => item.channelCodes),
                    frequencies: subscriptions.map((item) => item.frequency),
                },
                questionStats: {
                    total: messages.filter((item) => item.role === "user").length,
                    followUpCount: Math.max(messages.filter((item) => item.role === "user").length - 1, 0),
                    pageTypeDistribution: messages.reduce((result, item) => {
                        if (!item.pageType) {
                            return result;
                        }
                        result[item.pageType] = (result[item.pageType] ?? 0) + 1;
                        return result;
                    }, {}),
                },
                recentQuestions,
                recentFeedback,
            };
            const llmResult = env_1.env.deepseekApiBaseUrl
                ? await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, {
                    model: env_1.env.deepseekModel,
                    messages: [
                        {
                            role: "system",
                            content: (0, profile_prompts_1.buildUserProfileAnalysisSystemPrompt)(),
                        },
                        {
                            role: "user",
                            content: (0, profile_prompts_1.buildUserProfileAnalysisUserPrompt)(payload),
                        },
                    ],
                    temperature: 0.2,
                    response_format: {
                        type: "json_object",
                    },
                }, {
                    headers: env_1.env.deepseekApiKey
                        ? {
                            Authorization: `Bearer ${env_1.env.deepseekApiKey}`,
                        }
                        : undefined,
                    timeout: 60000,
                })
                : undefined;
            const parsed = llmResult
                ? profileOutputSchema.parse(JSON.parse(llmResult.data?.choices?.[0]?.message?.content ?? "{}"))
                : buildFallbackProfile({
                    channelCodes: payload.subscriptions.channelCodes,
                    recentFeedback: recentFeedback.map((item) => item.content),
                });
            await store_1.userProfileStore.upsertByUser(userId, {
                profileVersion: 1,
                preferenceSummary: parsed.preferenceSummary,
                personaPrompt: parsed.personaPrompt.slice(0, 500),
                interestTopics: parsed.interestTopics,
                responsePreferences: parsed.responsePreferences,
                evidenceStats: {
                    questionCount: payload.questionStats.total,
                    feedbackCount: recentFeedback.length,
                    confidence: parsed.confidence,
                },
            });
            processedCount += 1;
            successCount += 1;
            await store_1.userProfileAnalysisJobStore.updateCounters(job.id, {
                processedCount,
                successCount,
                failedCount: processedCount - successCount,
            });
        }
        return await store_1.userProfileAnalysisJobStore.markSuccess(job.id);
    }
    catch (error) {
        return await store_1.userProfileAnalysisJobStore.markFailed(job.id, error instanceof Error ? error.message : "unknown_error");
    }
};
exports.runUserProfileAnalysisJob = runUserProfileAnalysisJob;
