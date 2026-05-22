import axios from "axios";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAdmin, requireAuth } from "../../middleware/auth";

const summarySchema = z.object({
  content: z.string().min(1),
});

const chatSchema = z.object({
  message: z.string().min(1),
  userId: z.string().optional(),
  knowledgeGptId: z.string().optional(),
  sessionId: z.string().optional(),
  chatType: z.string().default("ZSH_CHAT"),
  gptType: z.string().optional(),
});

const pageAgentSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.any().optional(),
  })).default([]),
});

const toAiXyPayload = (content: string) => ({
  model: env.deepseekModel,
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

const cleanThinkContent = (content: unknown): string => {
  let normalized = String(content ?? "");
  if (normalized.includes("</think>")) {
    normalized = normalized.split("</think>")[1] ?? normalized;
  }
  return normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
};

const buildPageAgentResponse = (model: string, text: string, success: boolean) => {
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

export const aiXyRouter = Router();

const pageAgentHandler = async (request: Request, response: Response) => {
  const parsed = pageAgentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (!env.deepseekApiBaseUrl) {
    response.json(
      buildPageAgentResponse(
        parsed.data.model ?? env.deepseekModel,
        "AI 服务暂不可用，请稍后重试。",
        false
      )
    );
    return;
  }
  try {
    const latest = [...parsed.data.messages].reverse().find((item) => item.role === "user");
    const latestText =
      typeof latest?.content === "string"
        ? latest.content
        : JSON.stringify(latest?.content ?? "");
    const chatResult = await axios.post(
      `${env.aiXyApiUrl}/v1/knowledge/chat`,
      {
        message: latestText,
        userId: env.aiXyDefaultUserId,
        knowledgeGptId: env.aiXyDefaultKnowledgeGptId,
        chatType: env.aiXyDefaultChatType,
        gptType: env.aiXyDefaultGptType,
      },
      {
        headers: env.aiXyApiKey
          ? {
              Authorization: `Bearer ${env.aiXyApiKey}`,
            }
          : undefined,
        timeout: 60000,
      }
    );
    const answer = cleanThinkContent(chatResult.data?.answer);
    response.json(
      buildPageAgentResponse(parsed.data.model ?? env.deepseekModel, answer || "已完成", true)
    );
  } catch {
    response.json(
      buildPageAgentResponse(
        parsed.data.model ?? env.deepseekModel,
        "AI 服务暂不可用，请稍后重试。",
        false
      )
    );
  }
};

aiXyRouter.post("/page-agent/v1/chat/completions", requireAuth, pageAgentHandler);
aiXyRouter.post("/page-agent/chat/completions", requireAuth, pageAgentHandler);

aiXyRouter.post("/summary", requireAuth, async (request, response) => {
  const parsed = summarySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (!env.deepseekApiBaseUrl) {
    response.status(500).json({ message: "未配置 DEEPSEEK_API_BASE_URL" });
    return;
  }
  const result = await axios.post(
    `${env.deepseekApiBaseUrl}/v1/chat/completions`,
    toAiXyPayload(parsed.data.content),
    {
      headers: env.deepseekApiKey
        ? {
            Authorization: `Bearer ${env.deepseekApiKey}`,
          }
        : undefined,
      timeout: 60000,
    }
  );
  let summary = result.data?.choices?.[0]?.message?.content ?? "";
  summary = cleanThinkContent(summary);
  response.json({ summary });
});

aiXyRouter.post("/chat", requireAuth, async (request, response) => {
  const parsed = chatSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (!env.aiXyApiUrl) {
    response.status(500).json({ message: "未配置AI_XY_API_URL" });
    return;
  }
  const result = await axios.post(
    `${env.aiXyApiUrl}/v1/knowledge/chat`,
    {
      ...parsed.data,
      userId: parsed.data.userId ?? env.aiXyDefaultUserId,
      knowledgeGptId: parsed.data.knowledgeGptId ?? env.aiXyDefaultKnowledgeGptId,
      chatType: parsed.data.chatType ?? env.aiXyDefaultChatType,
      gptType: parsed.data.gptType ?? env.aiXyDefaultGptType,
    },
    {
      headers: env.aiXyApiKey
        ? {
            Authorization: `Bearer ${env.aiXyApiKey}`,
          }
        : undefined,
      timeout: 60000,
    }
  );
  const answer = cleanThinkContent(result.data?.answer);
  response.json({ ...result.data, answer });
});

aiXyRouter.post("/chat/stream", requireAuth, async (request, response) => {
  const parsed = chatSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (!env.aiXyApiUrl) {
    response.status(500).json({ message: "未配置AI_XY_API_URL" });
    return;
  }
  const streamResponse = await axios.post(
    `${env.aiXyApiUrl}/v1/knowledge/chat/stream`,
    {
      ...parsed.data,
      userId: parsed.data.userId ?? env.aiXyDefaultUserId,
      knowledgeGptId: parsed.data.knowledgeGptId ?? env.aiXyDefaultKnowledgeGptId,
      chatType: parsed.data.chatType ?? env.aiXyDefaultChatType,
      gptType: parsed.data.gptType ?? env.aiXyDefaultGptType,
    },
    {
      headers: env.aiXyApiKey
        ? {
            Authorization: `Bearer ${env.aiXyApiKey}`,
          }
        : undefined,
      responseType: "stream",
      timeout: 70000,
    }
  );
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

aiXyRouter.get("/health", requireAdmin, async (_request, response) => {
  if (!env.aiXyApiUrl) {
    response.status(500).json({ ok: false, message: "未配置AI_XY_API_URL" });
    return;
  }
  try {
    await axios.get(`${env.aiXyApiUrl}/v1/models`, { timeout: 5000 });
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ ok: false, message: "AI服务连接失败" });
  }
});
