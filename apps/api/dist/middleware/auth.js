"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminOrStatsExternalReadToken = exports.requireInternalToken = exports.requireAdminOrFeedbackReadToken = exports.requireAdminOrInternalToken = exports.requireFeedbackReader = exports.requireStatsReader = exports.requireContentHubOperator = exports.requireAdmin = exports.requireAuth = void 0;
const env_1 = require("../config/env");
const store_1 = require("../lib/store");
const getRequestUser = (request) => {
    if (env_1.env.devAuthBypass) {
        return { id: "dev-mock-id", displayName: "Dev Admin", role: "admin", username: "admin" };
    }
    return request.session.user;
};
const extractInternalAuthToken = (request) => {
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
const getConfiguredInternalAuthToken = async () => {
    if (env_1.env.wecomInternalAuthToken) {
        return env_1.env.wecomInternalAuthToken;
    }
    const config = await store_1.wecomConfigStore.getEnabledConfig(env_1.env.wecomAppCode);
    return config?.internalAuthToken;
};
const contentHubAllowedUserIds = new Set(["100002013029"]);
const isContentHubAllowedUser = (user) => {
    if (user.role === "admin") {
        return true;
    }
    const userId = user.id?.trim();
    const username = user.username?.trim();
    return ((userId ? contentHubAllowedUserIds.has(userId) : false) ||
        (username ? contentHubAllowedUserIds.has(username) : false));
};
const requireAuth = (request, response, next) => {
    if (!getRequestUser(request)) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
const requireAdmin = (request, response, next) => {
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
exports.requireAdmin = requireAdmin;
const requireContentHubOperator = (request, response, next) => {
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
exports.requireContentHubOperator = requireContentHubOperator;
exports.requireStatsReader = exports.requireAuth;
exports.requireFeedbackReader = exports.requireContentHubOperator;
const requireAdminOrInternalToken = async (request, response, next) => {
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
exports.requireAdminOrInternalToken = requireAdminOrInternalToken;
const requireAdminOrFeedbackReadToken = (request, response, next) => {
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
    if (!env_1.env.feedbackExternalReadToken || requestToken !== env_1.env.feedbackExternalReadToken) {
        response.status(403).json({ message: "反馈读取令牌无效" });
        return;
    }
    next();
};
exports.requireAdminOrFeedbackReadToken = requireAdminOrFeedbackReadToken;
const requireInternalToken = async (request, response, next) => {
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
exports.requireInternalToken = requireInternalToken;
const requireAdminOrStatsExternalReadToken = (request, response, next) => {
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
    if (!env_1.env.statsExternalReadToken || requestToken !== env_1.env.statsExternalReadToken) {
        response.status(403).json({ message: "统计读取令牌无效" });
        return;
    }
    next();
};
exports.requireAdminOrStatsExternalReadToken = requireAdminOrStatsExternalReadToken;
