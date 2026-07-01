import axios from "axios";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { SessionUser } from "../../lib/types";

const ticketSchema = z.object({
  ticket: z.string().min(1),
});

const loginQuerySchema = z.object({
  redirect: z.string().trim().optional(),
});

const collectCasAttributes = (value: string): Record<string, string[]> => {
  const attributes: Record<string, string[]> = {};
  const blockMatch = value.match(
    /<cas:attributes>([\s\S]*?)<\/cas:attributes>|<attributes>([\s\S]*?)<\/attributes>/
  );
  const block = blockMatch?.[1] ?? blockMatch?.[2] ?? "";
  if (!block) {
    return attributes;
  }

  const attributeRegex =
    /<(?:cas:)?([A-Za-z0-9_.-]+)>([\s\S]*?)<\/(?:cas:)?\1>/g;
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

const pickAttr = (
  attributes: Record<string, string[]>,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = attributes[key]?.[0];
    if (value) {
      return value;
    }
  }
  return undefined;
};

const parseCasValidateResponse = (value: string): SessionUser | undefined => {
  // Check for CAS 2.0/3.0 XML success
  if (value.includes("<cas:authenticationSuccess>")) {
    const userMatch = value.match(/<cas:user>([^<]+)<\/cas:user>/);
    if (userMatch && userMatch[1]) {
      const username = userMatch[1].trim();
      const attributes = collectCasAttributes(value);
      const displayName =
        pickAttr(attributes, ["cn", "displayName", "name", "realName"]) ??
        username;
      const email = pickAttr(attributes, ["mail", "email"]);
      const phone = pickAttr(
        attributes,
        ["mobile", "telephoneNumber", "phone", "phoneNumber"]
      );
      return {
        id: username,
        username,
        displayName,
        role: env.adminUserIds.includes(username) ? "admin" : "user",
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
    role: env.adminUserIds.includes(username) ? "admin" : "user",
  };
};

const buildDevUser = (): SessionUser => ({
  id: "dev-admin",
  username: "dev-admin",
  displayName: "开发管理员",
  role: "admin",
});

const normalizeWebBaseUrl = (raw: string): string => {
  const value = raw.trim();
  if (!value) {
    return "/";
  }
  return value.endsWith("/") ? value : `${value}/`;
};

const normalizeRedirectPath = (raw?: string): string => {
  const value = (raw ?? "").trim();
  if (!value) return "/";
  // 如果是完整 URL，提取 pathname
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const u = new URL(value);
      return u.pathname + u.search + u.hash || "/";
    } catch { /* fall through */ }
  }
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};

const buildCasServiceUrl = (redirectPath: string): string => {
  const separator = env.casServiceUrl.includes("?") ? "&" : "?";
  return `${env.casServiceUrl}${separator}redirect=${encodeURIComponent(redirectPath)}`;
};

const buildWebRedirectUrl = (redirectPath: string): string => {
  const base = normalizeWebBaseUrl(env.webBaseUrl);
  if (redirectPath === "/") {
    return base;
  }
  return `${base.replace(/\/$/, "")}${redirectPath}`;
};

export const authRouter = Router();

authRouter.get("/me", (request, response) => {
  response.json({ user: request.session.user ?? null });
});

authRouter.get("/cas/login", (request, response) => {
  const parsedQuery = loginQuerySchema.safeParse(request.query);
  const redirectPath = normalizeRedirectPath(parsedQuery.data?.redirect);
  const serviceUrl = env.casServiceUrl;
  // 将 redirect 存入独立 cookie + session 双保险：
  // - cas_redirect cookie: 浏览器自动回传，不受 session store 影响（主要机制）
  // - session.returnTo: 确保 session 被创建（saveUninitialized: false 时必需）+ fallback
  request.session.returnTo = redirectPath;
  response.cookie("cas_redirect", redirectPath, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 5 * 60 * 1000, // 5 分钟有效
    path: "/",
  });
  if (env.devAuthBypass) {
    response.redirect(
      `${env.appBaseUrl}/api/auth/cas/callback?ticket=DEV_BYPASS&redirect=${encodeURIComponent(redirectPath)}`
    );
    return;
  }
  if (!env.casLoginUrl) {
    response.status(500).json({ message: "未配置CAS登录地址" });
    return;
  }
  const redirect = `${env.casLoginUrl}?service=${encodeURIComponent(serviceUrl)}`;
  response.redirect(redirect);
});

authRouter.get("/cas/callback", async (request, response) => {
  const parsed = ticketSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "ticket参数无效" });
    return;
  }
  // 三级读取 redirect：cookie（主要）→ session（fallback）→ query（兼容旧链接）→ "/"（默认）
  const parsedQuery = loginQuerySchema.safeParse(request.query);
  const queryRedirect = parsedQuery.data?.redirect;
  const cookieRedirect = request.cookies?.cas_redirect;
  const sessionRedirect = request.session.returnTo;
  const redirectPath = normalizeRedirectPath(cookieRedirect ?? sessionRedirect ?? queryRedirect);
  // 用后即弃
  delete request.session.returnTo;
  response.clearCookie("cas_redirect", { path: "/" });
  const serviceUrl = env.casServiceUrl;
  const ticket = parsed.data.ticket;
  if (env.devAuthBypass && ticket === "DEV_BYPASS") {
    request.session.user = buildDevUser();
    response.redirect(buildWebRedirectUrl(redirectPath));
    return;
  }
  if (!env.casValidateUrl) {
    response.status(500).json({ message: "未配置CAS校验地址" });
    return;
  }
  const validateUrl =
    `${env.casValidateUrl}?service=${encodeURIComponent(serviceUrl)}` +
    `&ticket=${encodeURIComponent(ticket)}`;
  const result = await axios.get<string>(validateUrl, { timeout: 5000 });
  const user = parseCasValidateResponse(result.data);
  if (!user) {
    response.status(401).json({ message: "CAS票据校验失败" });
    return;
  }
  request.session.user = user;
  // 显式 save 后再 redirect，确保前端 /me 能立即读到用户
  request.session.save((saveErr) => {
    if (saveErr) {
      response.status(500).json({ message: "会话保存失败" });
      return;
    }
    response.redirect(buildWebRedirectUrl(redirectPath));
  });
});

authRouter.post("/logout", (request, response) => {
  request.session.destroy(() => undefined);
  response.clearCookie("sid");
  if (env.casLogoutUrl) {
    response.json({
      message: "已退出",
      logoutUrl: `${env.casLogoutUrl}?service=${encodeURIComponent(
        normalizeWebBaseUrl(env.webBaseUrl)
      )}`,
    });
    return;
  }
  response.json({ message: "已退出" });
});
