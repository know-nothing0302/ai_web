import axios from "axios";

import { type PageAgentMessage } from "./types";

const readClientDebugFlag = (): boolean => {
  const metaEnv = (import.meta as ImportMeta & {
    env?: { DEV?: boolean; VITE_PAGE_AGENT_DEBUG?: string };
  }).env;
  return Boolean(metaEnv?.DEV) || metaEnv?.VITE_PAGE_AGENT_DEBUG === "true";
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const pageAgentClientDebug = readClientDebugFlag();

export const logPageAgentClient = (
  event: string,
  payload?: Record<string, unknown>
): void => {
  if (!pageAgentClientDebug) {
    return;
  }
  console.info("[page-agent]", event, payload ?? {});
};

export const buildPageAgentClientErrorMessage = (
  stage: "conversation" | "answer",
  error: unknown
): string => {
  const prefix =
    stage === "conversation" ? "当前会话初始化失败" : "当前问题提交失败";
  const response = axios.isAxiosError(error)
    ? error.response
    : isRecord(error) && isRecord(error.response)
      ? {
          status:
            typeof error.response.status === "number" ? error.response.status : undefined,
          data: isRecord(error.response.data) ? error.response.data : undefined,
        }
      : undefined;
  const request = axios.isAxiosError(error)
    ? error.request
    : isRecord(error) && "request" in error
      ? error.request
      : undefined;

  if (response) {
    const backendMessage =
      typeof response.data?.message === "string" ? response.data.message.trim() : "";
    if (backendMessage) {
      return `${prefix}：${backendMessage}。请重试。`;
    }
    if (response.status) {
      return `${prefix}：服务返回 ${response.status}。请重试。`;
    }
  }
  if (request) {
    return `${prefix}：未收到服务响应。请检查后端服务、鉴权状态或网络。`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `${prefix}：${error.message.trim()}。请重试。`;
  }
  return `${prefix}：系统异常。请稍后重试。`;
};

export const appendAssistantErrorMessage = (
  messages: PageAgentMessage[],
  errorText: string
): PageAgentMessage[] => {
  return [
    ...messages,
    {
      id: `assistant-error-${Date.now()}`,
      role: "assistant",
      text: errorText,
      meta: {
        usedCurrentPage: false,
        usedSiteSearch: false,
        usedHistory: false,
        usedUserProfile: false,
        model: "system-fallback",
      },
    },
  ];
};
