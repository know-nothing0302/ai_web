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
  ProfileUserType,
} from "./profile_prompts";

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
}) => {
  const interestTopics = [...new Set(input.channelCodes)].slice(0, 3);
  return {
    preferenceSummary:
      input.recentFeedback.length > 0
        ? "用户倾向于更具体、结构化的回答。"
        : "用户偏好需要结合后续提问和反馈继续观察。",
    interestTopics,
    responsePreferences: {
      style: "structured",
    },
    personaPrompt:
      input.recentFeedback.length > 0
        ? "回答时优先分点说明，先给结论，再给步骤，必要时补充示例。"
        : "回答时保持简洁清晰，必要时分点说明。",
    confidence: "low" as const,
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
        // 增量跳过：7天内已分析过的用户不再重复分析
        const existingProfile = await userProfileStore.getByUserId(userId);
        if (existingProfile?.lastAnalyzedAt) {
          const lastAnalyzed = new Date(existingProfile.lastAnalyzedAt).getTime();
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (lastAnalyzed > sevenDaysAgo) {
            successCount += 1;
            processedCount += 1;
            await userProfileAnalysisJobStore.updateCounters(job.id, {
              processedCount,
              successCount,
              failedCount,
            });
            continue;
          }
        }

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
            pageTypeDistribution: messages.reduce<Record<string, number>>((result, item) => {
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

        const parsed = llmResult
          ? profileOutputSchema.parse(
              JSON.parse(llmResult.data?.choices?.[0]?.message?.content ?? "{}")
            )
          : buildFallbackProfile({
              channelCodes: payload.subscriptions.channelCodes,
              recentFeedback: recentFeedback.map((item) => item.content),
            });

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
