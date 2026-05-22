"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiXyRouter = void 0;
const axios_1 = __importDefault(require("axios"));
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const auth_1 = require("../../middleware/auth");
const summarySchema = zod_1.z.object({
    content: zod_1.z.string().min(1),
});
const chatSchema = zod_1.z.object({
    message: zod_1.z.string().min(1),
    userId: zod_1.z.string().optional(),
    knowledgeGptId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    chatType: zod_1.z.string().default("ZSH_CHAT"),
    gptType: zod_1.z.string().optional(),
});
const pageAgentSchema = zod_1.z.object({
    model: zod_1.z.string().optional(),
    messages: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.string(),
        content: zod_1.z.any().optional(),
    })).default([]),
});
const toAiXyPayload = (content) => ({
    model: env_1.env.deepseekModel,
    messages: [
        {
            role: "system",
            content: "你是教育行业AI资讯编辑助手，输出简洁、准确、可发布摘要。",
        },
        {
            role: "user",
            content: `请将以下内容提炼为150字以内中文摘要：\n${content}`,
        },
    ],
    temperature: 0.2,
});
const cleanThinkContent = (content) => {
    let normalized = String(content ?? "");
    if (normalized.includes("</think>")) {
        normalized = normalized.split("</think>")[1] ?? normalized;
    }
    return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};
const buildPageAgentResponse = (model, text, success) => {
    const pageAgentPayload = {
        evaluation_previous_goal: "已完成本轮问答",
        memory: "已返回可执行结果",
        next_goal: "继续等待用户下一条指令",
        action: {
            done: {
                text: text || "已完成",
                success,
            },
        },
    };
    return {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: {
                    role: "assistant",
                    content: text,
                    tool_calls: [
                        {
                            id: `call_${Date.now()}`,
                            type: "function",
                            function: {
                                name: "AgentOutput",
                                arguments: JSON.stringify(pageAgentPayload),
                            },
                        },
                    ],
                },
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
};
exports.aiXyRouter = (0, express_1.Router)();
const pageAgentHandler = async (request, response) => {
    const parsed = pageAgentSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    if (!env_1.env.deepseekApiBaseUrl) {
        response.json(buildPageAgentResponse(parsed.data.model ?? env_1.env.deepseekModel, "AI 服务暂不可用，请稍后重试。", false));
        return;
    }
    try {
        const latest = [...parsed.data.messages].reverse().find((item) => item.role === "user");
        const latestText = typeof latest?.content === "string"
            ? latest.content
            : JSON.stringify(latest?.content ?? "");
        const chatResult = await axios_1.default.post(`${env_1.env.aiXyApiUrl}/v1/knowledge/chat`, {
            message: latestText,
            userId: env_1.env.aiXyDefaultUserId,
            knowledgeGptId: env_1.env.aiXyDefaultKnowledgeGptId,
            chatType: env_1.env.aiXyDefaultChatType,
            gptType: env_1.env.aiXyDefaultGptType,
        }, {
            headers: env_1.env.aiXyApiKey
                ? {
                    Authorization: `Bearer ${env_1.env.aiXyApiKey}`,
                }
                : undefined,
            timeout: 60000,
        });
        const answer = cleanThinkContent(chatResult.data?.answer);
        response.json(buildPageAgentResponse(parsed.data.model ?? env_1.env.deepseekModel, answer || "已完成", true));
    }
    catch {
        response.json(buildPageAgentResponse(parsed.data.model ?? env_1.env.deepseekModel, "AI 服务暂不可用，请稍后重试。", false));
    }
};
exports.aiXyRouter.post("/page-agent/v1/chat/completions", auth_1.requireAuth, pageAgentHandler);
exports.aiXyRouter.post("/page-agent/chat/completions", auth_1.requireAuth, pageAgentHandler);
exports.aiXyRouter.post("/summary", auth_1.requireAuth, async (request, response) => {
    const parsed = summarySchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    if (!env_1.env.deepseekApiBaseUrl) {
        response.status(500).json({ message: "未配置 DEEPSEEK_API_BASE_URL" });
        return;
    }
    const result = await axios_1.default.post(`${env_1.env.deepseekApiBaseUrl}/v1/chat/completions`, toAiXyPayload(parsed.data.content), {
        headers: env_1.env.deepseekApiKey
            ? {
                Authorization: `Bearer ${env_1.env.deepseekApiKey}`,
            }
            : undefined,
        timeout: 60000,
    });
    let summary = result.data?.choices?.[0]?.message?.content ?? "";
    summary = cleanThinkContent(summary);
    response.json({ summary });
});
exports.aiXyRouter.post("/chat", auth_1.requireAuth, async (request, response) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    if (!env_1.env.aiXyApiUrl) {
        response.status(500).json({ message: "未配置AI_XY_API_URL" });
        return;
    }
    const result = await axios_1.default.post(`${env_1.env.aiXyApiUrl}/v1/knowledge/chat`, {
        ...parsed.data,
        userId: parsed.data.userId ?? env_1.env.aiXyDefaultUserId,
        knowledgeGptId: parsed.data.knowledgeGptId ?? env_1.env.aiXyDefaultKnowledgeGptId,
        chatType: parsed.data.chatType ?? env_1.env.aiXyDefaultChatType,
        gptType: parsed.data.gptType ?? env_1.env.aiXyDefaultGptType,
    }, {
        headers: env_1.env.aiXyApiKey
            ? {
                Authorization: `Bearer ${env_1.env.aiXyApiKey}`,
            }
            : undefined,
        timeout: 60000,
    });
    const answer = cleanThinkContent(result.data?.answer);
    response.json({ ...result.data, answer });
});
exports.aiXyRouter.post("/chat/stream", auth_1.requireAuth, async (request, response) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    if (!env_1.env.aiXyApiUrl) {
        response.status(500).json({ message: "未配置AI_XY_API_URL" });
        return;
    }
    const streamResponse = await axios_1.default.post(`${env_1.env.aiXyApiUrl}/v1/knowledge/chat/stream`, {
        ...parsed.data,
        userId: parsed.data.userId ?? env_1.env.aiXyDefaultUserId,
        knowledgeGptId: parsed.data.knowledgeGptId ?? env_1.env.aiXyDefaultKnowledgeGptId,
        chatType: parsed.data.chatType ?? env_1.env.aiXyDefaultChatType,
        gptType: parsed.data.gptType ?? env_1.env.aiXyDefaultGptType,
    }, {
        headers: env_1.env.aiXyApiKey
            ? {
                Authorization: `Bearer ${env_1.env.aiXyApiKey}`,
            }
            : undefined,
        responseType: "stream",
        timeout: 70000,
    });
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    streamResponse.data.on("error", () => {
        response.end();
    });
    request.on("close", () => {
        streamResponse.data.destroy();
    });
    streamResponse.data.pipe(response);
});
exports.aiXyRouter.get("/health", auth_1.requireAdmin, async (_request, response) => {
    if (!env_1.env.aiXyApiUrl) {
        response.status(500).json({ ok: false, message: "未配置AI_XY_API_URL" });
        return;
    }
    try {
        await axios_1.default.get(`${env_1.env.aiXyApiUrl}/v1/models`, { timeout: 5000 });
        response.json({ ok: true });
    }
    catch (error) {
        response.status(500).json({ ok: false, message: "AI服务连接失败" });
    }
});
