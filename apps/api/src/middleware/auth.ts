import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { wecomConfigStore } from "../lib/store";
import { SessionUser } from "../lib/types";

const getRequestUser = (request: Request): SessionUser | undefined => {
  if (env.devAuthBypass) {
    return { id: "dev-mock-id", displayName: "Dev Admin", role: "admin", username: "admin" };
  }
  return request.session.user;
};

const extractInternalAuthToken = (request: Request): string | undefined => {
  const headerToken = request.header("x-internal-auth-token")?.trim();
  if (headerToken) {
    return headerToken;
  }
  const authorization = request.header("authorization")?.trim();
  if (!authorization) {
    return undefined;
  }
  const [scheme, credentials] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !credentials) {
    return undefined;
  }
  return credentials.trim();
};

const getConfiguredInternalAuthToken = async (): Promise<string | undefined> => {
  if (env.wecomInternalAuthToken) {
    return env.wecomInternalAuthToken;
  }
  const config = await wecomConfigStore.getEnabledConfig(env.wecomAppCode);
  return config?.internalAuthToken;
};

const contentHubAllowedUserIds = new Set<string>(["100002013029"]);

const isContentHubAllowedUser = (user: SessionUser): boolean => {
  if (user.role === "admin") {
    return true;
  }
  const userId = user.id?.trim();
  const username = user.username?.trim();
  return (
    (userId ? contentHubAllowedUserIds.has(userId) : false) ||
    (username ? contentHubAllowedUserIds.has(username) : false)
  );
};

export const requireAuth = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  if (!getRequestUser(request)) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  next();
};

export const requireAdmin = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (!user) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  if (user.role !== "admin") {
    response.status(403).json({ message: "无权限" });
    return;
  }
  next();
};

export const requireContentHubOperator = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (!user) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  if (!isContentHubAllowedUser(user)) {
    response.status(403).json({ message: "无权限" });
    return;
  }
  next();
};

export const requireStatsReader = requireAuth;
export const requireFeedbackReader = requireContentHubOperator;

export const requireAdminOrInternalToken = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  const user = getRequestUser(request);
  if (user?.role === "admin") {
    next();
    return;
  }
  const requestToken = extractInternalAuthToken(request);
  const configuredToken = await getConfiguredInternalAuthToken();
  if (!requestToken) {
    response.status(401).json({ message: "未登录，且缺少内部认证令牌" });
    return;
  }
  if (!configuredToken || requestToken !== configuredToken) {
    response.status(403).json({ message: "内部认证令牌无效" });
    return;
  }
  next();
};

export const requireAdminOrFeedbackWriteToken = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (user?.role === "admin") {
    next();
    return;
  }

  const requestToken = extractInternalAuthToken(request);
  if (!requestToken) {
    response.status(401).json({ message: "未登录，且缺少反馈写入令牌" });
    return;
  }

  if (!env.feedbackInternalWriteToken || requestToken !== env.feedbackInternalWriteToken) {
    response.status(403).json({ message: "反馈写入令牌无效" });
    return;
  }

  next();
};

export const requireAdminOrFeedbackReadToken = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (user?.role === "admin") {
    next();
    return;
  }

  const requestToken = extractInternalAuthToken(request);
  if (!requestToken) {
    response.status(401).json({ message: "未登录，且缺少反馈读取令牌" });
    return;
  }

  if (!env.feedbackExternalReadToken || requestToken !== env.feedbackExternalReadToken) {
    response.status(403).json({ message: "反馈读取令牌无效" });
    return;
  }

  next();
};

export const requireInternalToken = async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  const requestToken = extractInternalAuthToken(request);
  const configuredToken = await getConfiguredInternalAuthToken();
  if (!requestToken) {
    response.status(401).json({ message: "缺少内部认证令牌" });
    return;
  }
  if (!configuredToken || requestToken !== configuredToken) {
    response.status(403).json({ message: "内部认证令牌无效" });
    return;
  }
  next();
};

export const requireAdminOrStatsExternalReadToken = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const user = getRequestUser(request);
  if (user?.role === "admin") {
    next();
    return;
  }

  const requestToken = extractInternalAuthToken(request);
  if (!requestToken) {
    response.status(401).json({ message: "未登录，且缺少统计读取令牌" });
    return;
  }

  if (!env.statsExternalReadToken || requestToken !== env.statsExternalReadToken) {
    response.status(403).json({ message: "统计读取令牌无效" });
    return;
  }

  next();
};
