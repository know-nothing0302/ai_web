"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUserProfileAnalysisJob = void 0;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const db_1 = require("../../lib/db");
const logger_1 = require("../../lib/logger");
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
        preferenceSummary: profile_prompts_1.preferenceSummaryFallbackByUserType[input.userType],
        interestTopics,
        responsePreferences: {
            style: "structured",
        },
        personaPrompt: profile_prompts_1.personaPromptFallbackByUserType[input.userType],
        confidence: "low",
    };
};
/**
 * 确保 LLM 输出或 fallback 中 personaPrompt 和 preferenceSummary 不为空。
 * LLM 可能返回空字符串，此时用用户类型对应的默认值兜底。
 */
const ensureNonEmptyProfile = (parsed, userType) => ({
    ...parsed,
    personaPrompt: parsed.personaPrompt.trim() ||
        profile_prompts_1.personaPromptFallbackByUserType[userType],
    preferenceSummary: parsed.preferenceSummary.trim() ||
        profile_prompts_1.preferenceSummaryFallbackByUserType[userType],
    responsePreferences: Object.keys(parsed.responsePreferences).length > 0
        ? parsed.responsePreferences
        : { style: "structured" },
});
/**
 * 根据学工号前缀推断用户类型。
 * 1 开头 → teacher（教职工），2 开头 → undergraduate（本科生），
 * 3 开头 → graduate（研究生），其余 → unknown。
 */
const detectUserType = (xh) => {
    const first = xh.charAt(0);
    if (first === "1")
        return "teacher";
    if (first === "2")
        return "undergraduate";
    if (first === "3")
        return "graduate";
    return "unknown";
};
/**
 * 从 Oracle 同步的 users 表获取专业背景（仅组织归属，不含身份信息）。
 * 返回脱敏后的院系/专业/年级，供画像分析使用。
 */
const getProfessionalContext = async (xh) => {
    try {
        const row = await store_1.userStore.getByXh(xh);
        if (!row)
            return undefined;
        const ctx = {};
        if (row.xymc?.trim())
            ctx.college = (0, sanitize_1.sanitizeForModel)(row.xymc.trim());
        if (row.zymc?.trim())
            ctx.major = (0, sanitize_1.sanitizeForModel)(row.zymc.trim());
        if (row.nj?.trim())
            ctx.grade = (0, sanitize_1.sanitizeForModel)(row.nj.trim());
        // 只返回有内容的字段
        return Object.keys(ctx).length > 0 ? ctx : undefined;
    }
    catch {
        // users 表查询失败不阻塞画像分析
        return undefined;
    }
};
const runUserProfileAnalysisJob = async (input) => {
    // 并发保护：跳过已有正在运行的任务
    const activeCheck = await (0, db_1.query)(`SELECT id FROM user_profile_analysis_jobs WHERE status IN ('pending', 'running') LIMIT 1`);
    if (activeCheck.rows.length > 0) {
        const existing = await store_1.userProfileAnalysisJobStore.getById(activeCheck.rows[0].id);
        if (existing)
            return existing;
    }
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
        let failedCount = 0;
        for (const userId of userIds) {
            try {
                // 增量跳过：7天内已分析过的用户不再重复分析
                const existingProfile = await store_1.userProfileStore.getByUserId(userId);
                if (existingProfile?.lastAnalyzedAt) {
                    const lastAnalyzed = new Date(existingProfile.lastAnalyzedAt).getTime();
                    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    if (lastAnalyzed > sevenDaysAgo) {
                        successCount += 1;
                        processedCount += 1;
                        await store_1.userProfileAnalysisJobStore.updateCounters(job.id, {
                            processedCount,
                            successCount,
                            failedCount,
                        });
                        continue;
                    }
                }
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
                const userType = detectUserType(userId);
                const professionalContext = await getProfessionalContext(userId);
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
                    userType,
                    ...(professionalContext ? { professionalContext } : {}),
                };
                const llmResult = env_1.env.deepseekApiBaseUrl
                    ? await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, {
                        model: env_1.env.deepseekModel,
                        messages: [
                            {
                                role: "system",
                                content: (0, profile_prompts_1.buildUserProfileAnalysisSystemPrompt)(userType),
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
                const raw = llmResult
                    ? profileOutputSchema.parse(JSON.parse(llmResult.data?.choices?.[0]?.message?.content ?? "{}"))
                    : buildFallbackProfile({
                        channelCodes: payload.subscriptions.channelCodes,
                        recentFeedback: recentFeedback.map((item) => item.content),
                        userType,
                    });
                const parsed = ensureNonEmptyProfile(raw, userType);
                await store_1.userProfileStore.upsertByUser(userId, {
                    profileVersion: (existingProfile?.profileVersion ?? 0) + 1,
                    preferenceSummary: parsed.preferenceSummary,
                    personaPrompt: parsed.personaPrompt.slice(0, 500),
                    interestTopics: parsed.interestTopics,
                    responsePreferences: parsed.responsePreferences,
                    evidenceStats: {
                        questionCount: payload.questionStats.total,
                        feedbackCount: recentFeedback.length,
                        confidence: parsed.confidence,
                        userType,
                    },
                });
                successCount += 1;
            }
            catch (error) {
                failedCount += 1;
                logger_1.logger.error("profile.analysis.user.failed", {
                    jobId: job.id,
                    userId,
                    error: error instanceof Error ? error.message : "unknown_error",
                });
            }
            processedCount += 1;
            await store_1.userProfileAnalysisJobStore.updateCounters(job.id, {
                processedCount,
                successCount,
                failedCount,
            });
        }
        return await store_1.userProfileAnalysisJobStore.markSuccess(job.id);
    }
    catch (error) {
        return await store_1.userProfileAnalysisJobStore.markFailed(job.id, error instanceof Error ? error.message : "unknown_error");
    }
};
exports.runUserProfileAnalysisJob = runUserProfileAnalysisJob;
