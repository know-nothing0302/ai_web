"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const axios_1 = __importDefault(require("axios"));
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const ticketSchema = zod_1.z.object({
    ticket: zod_1.z.string().min(1),
});
const loginQuerySchema = zod_1.z.object({
    redirect: zod_1.z.string().trim().optional(),
});
const collectCasAttributes = (value) => {
    const attributes = {};
    const blockMatch = value.match(/<cas:attributes>([\s\S]*?)<\/cas:attributes>|<attributes>([\s\S]*?)<\/attributes>/);
    const block = blockMatch?.[1] ?? blockMatch?.[2] ?? "";
    if (!block) {
        return attributes;
    }
    const attributeRegex = /<(?:cas:)?([A-Za-z0-9_.-]+)>([\s\S]*?)<\/(?:cas:)?\1>/g;
    let match = attributeRegex.exec(block);
    while (match) {
        const key = match[1].trim();
        const raw = match[2].trim();
        if (key && raw) {
            if (!attributes[key]) {
                attributes[key] = [];
            }
            attributes[key].push(raw);
        }
        match = attributeRegex.exec(block);
    }
    return attributes;
};
const pickAttr = (attributes, keys) => {
    for (const key of keys) {
        const value = attributes[key]?.[0];
        if (value) {
            return value;
        }
    }
    return undefined;
};
const parseCasValidateResponse = (value) => {
    // Check for CAS 2.0/3.0 XML success
    if (value.includes("<cas:authenticationSuccess>")) {
        const userMatch = value.match(/<cas:user>([^<]+)<\/cas:user>/);
        if (userMatch && userMatch[1]) {
            const username = userMatch[1].trim();
            const attributes = collectCasAttributes(value);
            const displayName = pickAttr(attributes, ["cn", "displayName", "name", "realName"]) ??
                username;
            const email = pickAttr(attributes, ["mail", "email"]);
            const phone = pickAttr(attributes, ["mobile", "telephoneNumber", "phone", "phoneNumber"]);
            return {
                id: username,
                username,
                displayName,
                role: env_1.env.adminUserIds.includes(username) ? "admin" : "user",
                email,
                phone,
                attributes,
            };
        }
        return undefined;
    }
    // Fallback to CAS 1.0 format
    const lines = value.split("\n").map(line => line.trim());
    if (lines[0] !== "yes") {
        return undefined;
    }
    const username = lines[1] || "cas-user";
    return {
        id: username,
        username,
        displayName: username,
        role: env_1.env.adminUserIds.includes(username) ? "admin" : "user",
    };
};
const buildDevUser = () => ({
    id: "dev-admin",
    username: "dev-admin",
    displayName: "开发管理员",
    role: "admin",
});
const normalizeWebBaseUrl = (raw) => {
    const value = raw.trim();
    if (!value) {
        return "/";
    }
    return value.endsWith("/") ? value : `${value}/`;
};
const normalizeRedirectPath = (raw) => {
    const value = (raw ?? "").trim();
    if (!value || !value.startsWith("/")) {
        return "/";
    }
    if (value.startsWith("//")) {
        return "/";
    }
    return value;
};
const buildCasServiceUrl = (redirectPath) => {
    const separator = env_1.env.casServiceUrl.includes("?") ? "&" : "?";
    return `${env_1.env.casServiceUrl}${separator}redirect=${encodeURIComponent(redirectPath)}`;
};
const buildWebRedirectUrl = (redirectPath) => {
    const base = normalizeWebBaseUrl(env_1.env.webBaseUrl);
    if (redirectPath === "/") {
        return base;
    }
    return `${base.replace(/\/$/, "")}${redirectPath}`;
};
exports.authRouter = (0, express_1.Router)();
exports.authRouter.get("/me", (request, response) => {
    response.json({ user: request.session.user ?? null });
});
exports.authRouter.get("/cas/login", (request, response) => {
    const parsedQuery = loginQuerySchema.safeParse(request.query);
    const redirectPath = normalizeRedirectPath(parsedQuery.data?.redirect);
    // 将 redirect 存入 session，避免 CAS Server 清除 service URL 上的额外查询参数
    request.session.returnTo = redirectPath;
    const serviceUrl = env_1.env.casServiceUrl;
    if (env_1.env.devAuthBypass) {
        response.redirect(`${env_1.env.appBaseUrl}/api/auth/cas/callback?ticket=DEV_BYPASS&redirect=${encodeURIComponent(redirectPath)}`);
        return;
    }
    if (!env_1.env.casLoginUrl) {
        response.status(500).json({ message: "未配置CAS登录地址" });
        return;
    }
    const redirect = `${env_1.env.casLoginUrl}?service=${encodeURIComponent(serviceUrl)}`;
    response.redirect(redirect);
});
exports.authRouter.get("/cas/callback", async (request, response) => {
    const parsed = ticketSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "ticket参数无效" });
        return;
    }
    // 优先从 session 读取 redirect（避免 CAS Server 清除 service URL 上的额外参数），
    // 其次从 query 读取（兼容 devAuthBypass / 旧链接），最后回退到 "/"
    const parsedQuery = loginQuerySchema.safeParse(request.query);
    const queryRedirect = parsedQuery.data?.redirect;
    const sessionRedirect = request.session.returnTo;
    const redirectPath = normalizeRedirectPath(sessionRedirect ?? queryRedirect);
    // 用后即弃
    delete request.session.returnTo;
    const serviceUrl = env_1.env.casServiceUrl;
    const ticket = parsed.data.ticket;
    if (env_1.env.devAuthBypass && ticket === "DEV_BYPASS") {
        request.session.user = buildDevUser();
        response.redirect(buildWebRedirectUrl(redirectPath));
        return;
    }
    if (!env_1.env.casValidateUrl) {
        response.status(500).json({ message: "未配置CAS校验地址" });
        return;
    }
    const validateUrl = `${env_1.env.casValidateUrl}?service=${encodeURIComponent(serviceUrl)}` +
        `&ticket=${encodeURIComponent(ticket)}`;
    const result = await axios_1.default.get(validateUrl, { timeout: 5000 });
    const user = parseCasValidateResponse(result.data);
    if (!user) {
        response.status(401).json({ message: "CAS票据校验失败" });
        return;
    }
    request.session.user = user;
    response.redirect(buildWebRedirectUrl(redirectPath));
});
exports.authRouter.post("/logout", (request, response) => {
    request.session.destroy(() => undefined);
    response.clearCookie("sid");
    if (env_1.env.casLogoutUrl) {
        response.json({
            message: "已退出",
            logoutUrl: `${env_1.env.casLogoutUrl}?service=${encodeURIComponent(normalizeWebBaseUrl(env_1.env.webBaseUrl))}`,
        });
        return;
    }
    response.json({ message: "已退出" });
});
