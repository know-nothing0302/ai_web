"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeArticleDraft = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const isMarkdownHeading = (line) => /^#{2,4}\s+\S/.test(line);
const isMarkdownListItem = (line) => /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line);
const cleanThinkContent = (content) => {
    let normalized = String(content ?? "");
    if (normalized.includes("</think>")) {
        normalized = normalized.split("</think>")[1] ?? normalized;
    }
    return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};
const normalizeGeneratedMarkdown = (content) => {
    const lines = content
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd());
    const normalized = [];
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
const optimizeArticleDraft = async (input) => {
    logger_1.logger.info("article.ai_optimize.start", {
        userId: input.requestUserId,
        channelCode: input.channelCode || "",
        contentLength: input.content.length,
    });
    const response = await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, {
        model: env_1.env.deepseekModel,
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: "你是内容中枢编辑助手。请仅输出 JSON，对象字段只允许包含 suggestedTitle、suggestedSummary、suggestedChannelCode、optimizedContent、notes。",
            },
            {
                role: "user",
                content: JSON.stringify(input),
            },
        ],
    }, {
        headers: env_1.env.deepseekApiKey
            ? {
                Authorization: `Bearer ${env_1.env.deepseekApiKey}`,
            }
            : undefined,
        timeout: 60000,
    });
    const rawContent = cleanThinkContent(response.data?.choices?.[0]?.message?.content);
    const parsed = JSON.parse(rawContent);
    const normalizedContent = parsed.optimizedContent
        ? normalizeGeneratedMarkdown(parsed.optimizedContent)
        : undefined;
    logger_1.logger.info("article.ai_optimize.success", {
        userId: input.requestUserId,
        suggestedChannelCode: parsed.suggestedChannelCode || "",
        optimizedContentLength: normalizedContent?.length ?? 0,
    });
    return {
        ...parsed,
        optimizedContent: normalizedContent,
    };
};
exports.optimizeArticleDraft = optimizeArticleDraft;
