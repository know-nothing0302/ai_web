import axios from "axios";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { hashUserIdForDeepSeek } from "../page_agent/user_id_hash";

export interface ArticleAiOptimizeInput {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl?: string;
  requestUserId?: string;
}

export interface ArticleAiOptimizeResult {
  suggestedTitle?: string;
  suggestedSummary?: string;
  suggestedChannelCode?: string;
  optimizedContent?: string;
  notes?: string;
}

const isMarkdownHeading = (line: string): boolean => /^#{2,4}\s+\S/.test(line);

const isMarkdownListItem = (line: string): boolean =>
  /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line);

const cleanThinkContent = (content: unknown): string => {
  let normalized = String(content ?? "");
  if (normalized.includes("</think>")) {
    normalized = normalized.split("</think>")[1] ?? normalized;
  }
  return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

const normalizeGeneratedMarkdown = (content: string): string => {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      continue;
    }

    if (isMarkdownHeading(line)) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      normalized.push(line, "");
      continue;
    }

    if (isMarkdownListItem(line)) {
      const lastLine = normalized[normalized.length - 1] ?? "";
      if (lastLine !== "" && !isMarkdownListItem(lastLine)) {
        normalized.push("");
      }
      normalized.push(line);
      continue;
    }

    normalized.push(line);
  }

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const optimizeArticleDraft = async (
  input: ArticleAiOptimizeInput
): Promise<ArticleAiOptimizeResult> => {
  logger.info("article.ai_optimize.start", {
    userId: input.requestUserId,
    channelCode: input.channelCode || "",
    contentLength: input.content.length,
  });

  const response = await axios.post(
    `${env.deepseekApiBaseUrl}/v1/chat/completions`,
    {
      model: env.deepseekModel,
      temperature: 0.2,
      ...(input.requestUserId
        ? { user_id: hashUserIdForDeepSeek(input.requestUserId) }
        : {}),
      messages: [
        {
          role: "system",
          content:
            "你是内容中枢编辑助手。请仅输出 JSON，对象字段只允许包含 suggestedTitle、suggestedSummary、suggestedChannelCode、optimizedContent、notes。",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    },
    {
      headers: env.deepseekApiKey
        ? {
            Authorization: `Bearer ${env.deepseekApiKey}`,
          }
        : undefined,
      timeout: 60000,
    }
  );

  const rawContent = cleanThinkContent(response.data?.choices?.[0]?.message?.content);
  const parsed = JSON.parse(rawContent) as ArticleAiOptimizeResult;
  const normalizedContent = parsed.optimizedContent
    ? normalizeGeneratedMarkdown(parsed.optimizedContent)
    : undefined;
  logger.info("article.ai_optimize.success", {
    userId: input.requestUserId,
    suggestedChannelCode: parsed.suggestedChannelCode || "",
    optimizedContentLength: normalizedContent?.length ?? 0,
  });
  return {
    ...parsed,
    optimizedContent: normalizedContent,
  };
};
