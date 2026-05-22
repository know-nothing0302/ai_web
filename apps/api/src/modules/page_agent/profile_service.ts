import axios from "axios";
import { z } from "zod";

import { env } from "../../config/env";
import {
  pageAgentMessageStore,
  subscriptionStore,
  userProfileAnalysisJobStore,
  userProfileStore,
} from "../../lib/store";
import { UserProfileAnalysisTriggerMode } from "../../lib/types";
import { sanitizeForModel } from "./sanitize";
import {
  buildUserProfileAnalysisSystemPrompt,
  buildUserProfileAnalysisUserPrompt,
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

export const runUserProfileAnalysisJob = async (input: {
  triggerMode: UserProfileAnalysisTriggerMode;
  targetUserId?: string;
}) => {
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

    for (const userId of userIds) {
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
      };

      const llmResult = env.deepseekApiBaseUrl
        ? await axios.post(
            `${env.deepseekApiBaseUrl}/v1/chat/completions`,
            {
              model: env.deepseekModel,
              messages: [
                {
                  role: "system",
                  content: buildUserProfileAnalysisSystemPrompt(),
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
      await userProfileAnalysisJobStore.updateCounters(job.id, {
        processedCount,
        successCount,
        failedCount: processedCount - successCount,
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
