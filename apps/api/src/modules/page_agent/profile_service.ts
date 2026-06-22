import axios from "axios";
import { z } from "zod";

import { env } from "../../config/env";
import { query } from "../../lib/db";
import { logger } from "../../lib/logger";
import {
  pageAgentMessageStore,
  subscriptionStore,
  userProfileAnalysisJobStore,
  userProfileStore,
  userStore,
} from "../../lib/store";
import { UserProfileAnalysisTriggerMode } from "../../lib/types";
import { sanitizeForModel } from "./sanitize";
import {
  buildUserProfileAnalysisSystemPrompt,
  buildUserProfileAnalysisUserPrompt,
  personaPromptFallbackByUserType,
  preferenceSummaryFallbackByUserType,
  ProfileUserType,
} from "./profile_prompts";
import { hashUserIdForDeepSeek } from "./user_id_hash";

const profileOutputSchema = z.object({
  preferenceSummary: z.string().trim().default(""),
  interestTopics: z.array(z.string().trim()).default([]),
  responsePreferences: z.record(z.string(), z.unknown()).default({}),
  personaPrompt: z.string().trim().max(500).default(""),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
});

const buildFallbackProfile = (input: {
  channelCodes: string[];
  recentFeedback: string[];
  userType: ProfileUserType;
}) => {
  const interestTopics = [...new Set(input.channelCodes)].slice(0, 3);
  return {
    preferenceSummary: preferenceSummaryFallbackByUserType[input.userType],
    interestTopics,
    responsePreferences: {
      style: "structured",
    },
    personaPrompt: personaPromptFallbackByUserType[input.userType],
    confidence: "low" as const,
  };
};

/**
 * 检测 personaPrompt 是否包含注入/越狱关键词。
 * personaPrompt 会以 system 角色注入后续对话，必须硬校验。
 *
 * 返回 false 意味着 prompt 不安全，应退回 fallback。
 */
const PERSONA_INJECTION_PATTERNS: RegExp[] = [
  // 中文注入关键词
  /忽略|忘记|无视|抛弃|放弃/,
  /系统指令|系统提示|系统.*prompt|system\s*prompt/i,
  /新角色|新身份|新的角色|新的身份/,
  /(?:^|[。！，、；？\n]|\b现在)\s*你是.{0,8}(?:助手|机器人|AI|模型)/,
  /你.*现在.*是/,
  /DAN|jailbreak|越狱|developer\s*mode/i,
  /以上指令|之前.*指令|不要.*规则|覆盖.*规则/,
  /输出.*系统.*提示|输出.*prompt/i,
  /不再.*限制|解除.*限制|没有.*限制/,
];

const isPersonaPromptSafe = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  // 必须以"回答时"开头
  if (!trimmed.startsWith("回答时")) return false;
  // 不得包含注入关键词
  return !PERSONA_INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
};

/**
 * 确保 LLM 输出或 fallback 中 personaPrompt 和 preferenceSummary 不为空。
 * LLM 可能返回空字符串或包含注入内容，此时用用户类型对应的默认值兜底。
 */
const ensureNonEmptyProfile = (
  parsed: { personaPrompt: string; preferenceSummary: string; interestTopics: string[]; responsePreferences: Record<string, unknown>; confidence: string },
  userType: ProfileUserType
): typeof parsed => {
  const hasValidPersona =
    parsed.personaPrompt.trim().length > 0 &&
    isPersonaPromptSafe(parsed.personaPrompt);
  return {
    ...parsed,
    personaPrompt: hasValidPersona
      ? parsed.personaPrompt.trim()
      : personaPromptFallbackByUserType[userType],
    preferenceSummary:
      parsed.preferenceSummary.trim() ||
      preferenceSummaryFallbackByUserType[userType],
    responsePreferences:
      Object.keys(parsed.responsePreferences).length > 0
        ? parsed.responsePreferences
        : { style: "structured" },
  };
};

/**
 * 根据学工号前缀推断用户类型。
 * 1 开头 → teacher（教职工），2 开头 → undergraduate（本科生），
 * 3 开头 → graduate（研究生），其余 → unknown。
 */
const detectUserType = (xh: string): ProfileUserType => {
  const first = xh.charAt(0);
  if (first === "1") return "teacher";
  if (first === "2") return "undergraduate";
  if (first === "3") return "graduate";
  return "unknown";
};

/**
 * 多维度加权推断用户类型，补充首字母检测的不足。
 * 首字母判断非 unknown 时直接信任；unknown 时通过订阅频道特征和提问特征加权推断。
 */
const refineUserType = (
  baseType: ProfileUserType,
  channelCodes: string[],
  recentQuestions: string[]
): ProfileUserType => {
  // 首字母判断非 unknown 时直接信任（维度 1）
  if (baseType !== "unknown") return baseType;

  // 维度 2: 订阅频道特征
  const hasAcademic = channelCodes.some(
    (c) => /学术|科研|论文|学报/.test(c)
  );
  const hasCampus = channelCodes.some(
    (c) => /通知|活动|社团/.test(c)
  );

  // 维度 3: 提问特征
  const avgLen = recentQuestions.length > 0
    ? recentQuestions.reduce((sum, q) => sum + q.length, 0) / recentQuestions.length
    : 0;
  const hasResearchTerms = recentQuestions.some(
    (q) => /论文|课题|研究|实验|数据|方法/.test(q)
  );
  const hasCourseTerms = recentQuestions.some(
    (q) => /考试|作业|上课|学分|课程/.test(q)
  );

  // 加权推断
  let teacherScore = 0, undergradScore = 0, gradScore = 0;
  if (hasAcademic) { teacherScore += 0.3; gradScore += 0.3; }
  if (hasCampus && !hasAcademic) undergradScore += 0.3;
  if (avgLen > 50) { teacherScore += 0.3; gradScore += 0.2; }
  if (hasResearchTerms) { teacherScore += 0.3; gradScore += 0.3; }
  if (hasCourseTerms) undergradScore += 0.3;

  const maxScore = Math.max(teacherScore, undergradScore, gradScore);
  if (maxScore < 0.3) return "unknown";  // 证据不足
  if (teacherScore >= gradScore && teacherScore === maxScore) return "teacher";
  if (gradScore === maxScore) return "graduate";
  return "undergraduate";
};

/**
 * 从 Oracle 同步的 users 表获取专业背景（仅组织归属，不含身份信息）。
 * 返回脱敏后的院系/专业/年级，供画像分析使用。
 */
const getProfessionalContext = async (
  xh: string
): Promise<{ college?: string; major?: string; grade?: string } | undefined> => {
  try {
    const row = await userStore.getByXh(xh);
    if (!row) return undefined;
    const ctx: { college?: string; major?: string; grade?: string } = {};
    if (row.xymc?.trim()) ctx.college = sanitizeForModel(row.xymc.trim());
    if (row.zymc?.trim()) ctx.major = sanitizeForModel(row.zymc.trim());
    if (row.nj?.trim()) ctx.grade = sanitizeForModel(row.nj.trim());
    // 只返回有内容的字段
    return Object.keys(ctx).length > 0 ? ctx : undefined;
  } catch {
    // users 表查询失败不阻塞画像分析
    return undefined;
  }
};


export const runUserProfileAnalysisJob = async (input: {
  triggerMode: UserProfileAnalysisTriggerMode;
  targetUserId?: string;
}) => {
  // 并发保护：跳过已有正在运行的任务
  const activeCheck = await query<{ id: string }>(
    `SELECT id FROM user_profile_analysis_jobs WHERE status IN ('pending', 'running') LIMIT 1`
  );
  if (activeCheck.rows.length > 0) {
    const existing = await userProfileAnalysisJobStore.getById(activeCheck.rows[0].id);
    if (existing) return existing;
  }

  const job = await userProfileAnalysisJobStore.create({
    triggerMode: input.triggerMode,
    targetUserId: input.targetUserId,
  });

  try {
    await userProfileAnalysisJobStore.markRunning(job.id);
    const userIds = input.targetUserId
      ? [input.targetUserId]
      : await pageAgentMessageStore.listDistinctUserIdsForProfileAnalysis(50);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const userId of userIds) {
      try {
        // 三级冷却检查：需要先获取近期数据才能判断是否跳过
        const existingProfile = await userProfileStore.getByUserId(userId);
        const subscriptions = await subscriptionStore.listByUser(userId);
        const messages = await pageAgentMessageStore.listRecentByUser(userId, 30);
        const recentQuestions = messages
          .filter((item) => item.role === "user")
          .map((item) => sanitizeForModel(item.content))
          .slice(-10);
        const recentFeedback = messages
          .filter((item) => item.role === "feedback")
          .map((item) => ({
            score: item.feedbackScore,
            tag: item.feedbackTag,
            content: sanitizeForModel(item.content),
            createdAt: item.createdAt,
          }))
          .slice(-10);

        // 提取共用变量（避免在冷却检查和 payload 中重复计算）
        const channelCodes = subscriptions.flatMap((item) => item.channelCodes);
        const pageTypeDistribution = messages.reduce<Record<string, number>>((result, item) => {
          if (!item.pageType) return result;
          result[item.pageType] = (result[item.pageType] ?? 0) + 1;
          return result;
        }, {});

        // 三级冷却检查
        if (existingProfile?.lastAnalyzedAt) {
          const lastAnalyzed = new Date(existingProfile.lastAnalyzedAt).getTime();
          const daysSinceLastAnalysis = (Date.now() - lastAnalyzed) / (1000 * 60 * 60 * 24);

          // > 5 天：冷却过期，直接进入分析（无需检查 level 1/2）
          if (daysSinceLastAnalysis > 5) {
            // fall through to analysis
          }
          // ≤ 5 天：检查 level 1/2 覆盖条件，否则跳过
          else {
            // 级别 1: 强制触发 — 最近 24h 内 ≥ 3 次负反馈
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recent24hNegatives = recentFeedback.filter(
              (f) => f.score === -1 && new Date(f.createdAt).getTime() > oneDayAgo
            ).length;
            if (recent24hNegatives >= 3) {
              logger.info("profile.analysis.trigger", { level: 1, reason: "negative_feedback_spike", userId, recent24hNegatives });
              // 不跳过，继续分析
            }
            // 级别 2: 行为漂移 — 频道集合变化 ≥ 2 且距上次 > 3 天
            else if (daysSinceLastAnalysis > 3) {
              const prevCodes = new Set(existingProfile.lastBehaviorSnapshot?.channelCodes ?? []);
              const currCodes = new Set(channelCodes);
              const added = [...currCodes].filter((c) => !prevCodes.has(c)).length;
              const removed = [...prevCodes].filter((c) => !currCodes.has(c)).length;
              const driftCount = added + removed;
              if (driftCount >= 2) {
                logger.info("profile.analysis.trigger", { level: 2, reason: "behavior_drift", userId, driftCount, added, removed });
                // 不跳过，继续分析
              } else {
                // 级别 3: 常规 — 5 天冷却
                successCount += 1;
                processedCount += 1;
                await userProfileAnalysisJobStore.updateCounters(job.id, {
                  processedCount, successCount, failedCount,
                });
                continue;
              }
            }
            // 级别 3: 常规 — 5 天冷却（距上次 ≤ 3 天，且 level 1/2 未触发）
            else {
              successCount += 1;
              processedCount += 1;
              await userProfileAnalysisJobStore.updateCounters(job.id, {
                processedCount, successCount, failedCount,
              });
              continue;
            }
          }
        }
        const baseType = detectUserType(userId);
        const userType = refineUserType(baseType, channelCodes, recentQuestions);
        const professionalContext = await getProfessionalContext(userId);

        const payload = {
          subscriptions: {
            channelCodes,
            frequencies: subscriptions.map((item) => item.frequency),
          },
          questionStats: {
            total: messages.filter((item) => item.role === "user").length,
            followUpCount: Math.max(messages.filter((item) => item.role === "user").length - 1, 0),
            pageTypeDistribution,
          },
          recentQuestions,
          recentFeedback,
          userType,
          ...(professionalContext ? { professionalContext } : {}),
        };

        const llmResult = env.deepseekApiBaseUrl
          ? await axios.post(
              `${env.deepseekApiBaseUrl}/v1/chat/completions`,
              {
                model: env.deepseekModel,
                messages: [
                  {
                    role: "system",
                    content: buildUserProfileAnalysisSystemPrompt(userType),
                  },
                  {
                    role: "user",
                    content: buildUserProfileAnalysisUserPrompt(payload),
                  },
                ],
                temperature: 0.2,
                user_id: hashUserIdForDeepSeek(userId),
                response_format: {
                  type: "json_object",
                },
              },
              {
                headers: env.deepseekApiKey
                  ? {
                      Authorization: `Bearer ${env.deepseekApiKey}`,
                    }
                  : undefined,
                timeout: 60000,
              }
            )
          : undefined;

        const raw = llmResult
          ? profileOutputSchema.parse(
              JSON.parse(llmResult.data?.choices?.[0]?.message?.content ?? "{}")
            )
          : buildFallbackProfile({
              channelCodes: payload.subscriptions.channelCodes,
              recentFeedback: recentFeedback.map((item) => item.content),
              userType,
            });
        const parsed = ensureNonEmptyProfile(raw, userType);

        await userProfileStore.upsertByUser(userId, {
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
          lastBehaviorSnapshot: {
            channelCodes,
            pageTypeDistribution,
            questionCount: messages.filter((item) => item.role === "user").length,
          },
        });

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        logger.error("profile.analysis.user.failed", {
          jobId: job.id,
          userId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
      processedCount += 1;
      await userProfileAnalysisJobStore.updateCounters(job.id, {
        processedCount,
        successCount,
        failedCount,
      });
    }

    return await userProfileAnalysisJobStore.markSuccess(job.id);
  } catch (error) {
    return await userProfileAnalysisJobStore.markFailed(
      job.id,
      error instanceof Error ? error.message : "unknown_error"
    );
  }
};
