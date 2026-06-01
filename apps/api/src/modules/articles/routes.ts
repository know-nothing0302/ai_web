import { Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { type Article } from "../../lib/types";
import { requireAuth, requireContentHubOperator } from "../../middleware/auth";
import {
  annotationStore,
  articleChannelStore,
  articleStore,
  pushRecordStore,
  recordAnalyticsEventSafely,
  subscriptionStore,
} from "../../lib/store";
import { pushService } from "../push/service";
import {
  getPublishJwtSigningSpec,
  issuePublishJwt,
  validatePublishJwt,
  validatePublishTokenClient,
} from "./publish_jwt";
import { optimizeArticleDraft } from "./ai_optimize_service";
import { extractArticleFromUrl } from "./url_extract_service";

const originalUrlSchema = z.string().trim().url().max(1000).optional();
const publishedAtSchema = z.string().trim().datetime().optional();

const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
  content: z.string().min(1),
  sourceContent: z.string().trim().min(1).optional(),
  authorName: z.string().trim().min(1).max(80).optional(),
  originalUrl: originalUrlSchema,
  publishedAt: publishedAtSchema,
  channelCode: z.string().trim().min(1).max(64).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
});

const updateSchema = createSchema.partial();

const sectionSchema = z.object({
  heading: z.string().trim().min(1).max(80).optional(),
  body: z.array(z.string().trim().min(1).max(1200)).min(1).max(8).default([]),
  highlights: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
});

const layoutSchema = z.object({
  lead: z.string().trim().min(1).max(1200).optional(),
  sections: z.array(sectionSchema).min(1).max(20),
  conclusion: z.string().trim().min(1).max(1200).optional(),
});

const publishSchema = z
  .object({
    userId: z.string().trim().min(1).max(64),
    originalUrl: originalUrlSchema,
    article: z.object({
      title: z.string().trim().min(1).max(180),
      channelCode: z.string().trim().min(1).max(64).optional(),
      category: z.string().trim().min(1).max(120).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      status: z.enum(["draft"]).default("draft"),
      summary: z.string().trim().min(1).max(400).optional(),
      content: z.string().trim().min(1).optional(),
      sourceContent: z.string().trim().min(1).optional(),
      originalUrl: originalUrlSchema,
      publishedAt: publishedAtSchema,
      layout: layoutSchema.optional(),
      authorName: z.string().trim().min(1).max(80).optional(),
    }),
  })
  .superRefine((value, context) => {
    if (!value.article.content && !value.article.layout) {
      context.addIssue({
        code: "custom",
        path: ["article", "content"],
        message: "content 与 layout 至少提供一个",
      });
    }
    if (!value.article.channelCode && !value.article.category) {
      context.addIssue({
        code: "custom",
        path: ["article", "channelCode"],
        message: "channelCode 与 category 至少提供一个",
      });
    }
  });

const issueTokenSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  ttlSeconds: z.number().int().min(1).optional(),
});

const extractFromUrlSchema = z.object({
  url: z.string().trim().url().max(1000),
});

const aiOptimizeSchema = z.object({
  title: z.string().trim().max(180).optional(),
  content: z.string().trim().min(1),
  summary: z.string().trim().max(400).optional(),
  channelCode: z.string().trim().max(64).optional(),
  originalUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
});

const unauthorized = (response: Response, errorCode: string, description: string): void => {
  const headerDescription = encodeURIComponent(description);
  response.setHeader(
    "WWW-Authenticate",
    `Bearer realm="article-publish", error="${errorCode}", error_description="${headerDescription}"`
  );
  response.status(401).json({ message: description });
};

const unauthorizedClient = (
  response: Response,
  errorCode: string,
  description: string
): void => {
  const headerDescription = encodeURIComponent(description);
  response.setHeader(
    "WWW-Authenticate",
    `Basic realm="article-publish-token", error="${errorCode}", error_description="${headerDescription}"`
  );
  response.status(401).json({ message: description });
};

const buildContentFromLayout = (layout: z.infer<typeof layoutSchema>): string => {
  const lines: string[] = [];
  if (layout.lead) {
    lines.push(layout.lead.trim(), "");
  }
  layout.sections.forEach((section) => {
    if (section.heading) {
      lines.push(`## ${section.heading.trim()}`);
    }
    section.body.forEach((paragraph) => {
      lines.push(paragraph.trim(), "");
    });
    section.highlights.forEach((highlight) => {
      lines.push(`- ${highlight.trim()}`);
    });
    if (section.highlights.length > 0) {
      lines.push("");
    }
  });
  if (layout.conclusion) {
    lines.push("## 总结", layout.conclusion.trim());
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildSummary = (rawContent: string): string => {
  const normalized = rawContent.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
};

const categoryToChannelCode: Record<string, string> = {
  AI政策: "policy-ethics",
  通知公告: "campus-news",
  行业动态: "daily-ai-summary",
  每日AI摘要: "daily-ai-summary",
  "AI政策与伦理": "policy-ethics",
  医学AI前沿: "medical-frontier",
  高校AI动态: "campus-news",
  "AI+医学教育": "edu-plus-ai",
  工具与应用推荐: "tools-recommend",
  "学生专栏": "student-zone",
};

const resolveChannel = async (
  channelCode?: string,
  category?: string
): Promise<{ code: string; name: string }> => {
  const normalizedCode = channelCode?.trim();
  const normalizedCategory = category?.trim();
  const fallbackCode = normalizedCategory ? categoryToChannelCode[normalizedCategory] : undefined;
  const finalCode = normalizedCode || fallbackCode;
  if (!finalCode) {
    throw new Error("缺少有效栏目标识");
  }
  const channel = await articleChannelStore.getByCode(finalCode);
  if (!channel || !channel.enabled) {
    throw new Error("栏目不存在或已停用");
  }
  return { code: channel.code, name: channel.name };
};

const triggerPublishedArticlePush = (article: Article): void => {
  if (article.status !== "published") {
    return;
  }
  void pushService.handleArticlePublished(article).catch((error) => {
    logger.error("article.publish.push.failed", {
      articleId: article.id,
      channelCode: article.channelCode,
      error,
    });
  });
};

export const articleRouter = Router();

articleRouter.get("/", requireAuth, async (request, response) => {
  const channelCode = request.query.channelCode?.toString();
  const category = request.query.category?.toString();
  const keyword = request.query.keyword?.toString();
  const status = request.query.status?.toString();
  const list = await articleStore.list({
    channelCode,
    category,
    keyword,
    status: status === "draft" || status === "published" ? status : undefined,
  });
  response.json({ items: list });
});

articleRouter.get("/push-digests/today", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const subscriptions = await subscriptionStore.listByUser(userId);
  const targetUserIds = [
    userId,
    ...subscriptions.map((item) => item.qywxUserId),
  ];
  const items = await pushRecordStore.listTodayArticlesByUserIds(targetUserIds);
  response.json({
    date: new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
    total: items.length,
    items,
  });
});

articleRouter.get("/publish/spec", async (_request, response) => {
  const jwtSpec = getPublishJwtSigningSpec();
  const supportedChannels = await articleChannelStore.list(true);
  response.json({
    apiVersion: "1.0.0",
    endpoint: "/api/articles/publish",
    method: "POST",
    auth: {
      type: "JWT Bearer",
      header: "Authorization: Bearer <jwt>",
      algorithm: jwtSpec.algorithm,
      claims: {
        iss: jwtSpec.issuer,
        aud: jwtSpec.audience,
        sub: "userId",
        required: ["iss", "aud", "sub", "iat", "exp"],
      },
      keyRotation: {
        activeKid: jwtSpec.activeKid,
        publicKeyCount: jwtSpec.publicKeyCount,
        privateKeyCount: jwtSpec.privateKeyCount,
        headerKidRequired: true,
      },
      ttlSeconds: jwtSpec.ttlSeconds,
      maxTtlSeconds: jwtSpec.maxTtlSeconds,
      userIdField: "userId",
      allowListControl: "ARTICLE_PUBLISH_ALLOWED_USER_IDS",
    },
    tokenIssue: {
      endpoint: jwtSpec.tokenEndpoint,
      method: "POST",
      auth: {
        type: "HTTP Basic",
        header: "Authorization: Basic base64(clientId:clientSecret)",
        clientCount: jwtSpec.tokenClientCount,
      },
      requestSchema: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", maxLength: 64 },
          ttlSeconds: { type: "integer", minimum: 1, maximum: jwtSpec.maxTtlSeconds },
        },
      },
    },
    requestSchema: {
      type: "object",
      required: ["userId", "article"],
      properties: {
        userId: { type: "string", maxLength: 64 },
        originalUrl: { type: "string", format: "uri", maxLength: 1000 },
        article: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", maxLength: 180 },
            channelCode: { type: "string", maxLength: 64 },
            category: { type: "string", maxLength: 120 },
            tags: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 20 },
            status: { type: "string", enum: ["draft"], default: "draft" },
            summary: { type: "string", maxLength: 400 },
            content: { type: "string" },
            originalUrl: { type: "string", format: "uri", maxLength: 1000 },
            publishedAt: { type: "string", format: "date-time" },
            authorName: { type: "string", maxLength: 80 },
            layout: {
              type: "object",
              properties: {
                lead: { type: "string", maxLength: 1200 },
                sections: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    properties: {
                      heading: { type: "string", maxLength: 80 },
                      body: {
                        type: "array",
                        minItems: 1,
                        maxItems: 8,
                        items: { type: "string", maxLength: 1200 },
                      },
                      highlights: {
                        type: "array",
                        maxItems: 8,
                        items: { type: "string", maxLength: 300 },
                      },
                    },
                  },
                },
                conclusion: { type: "string", maxLength: 1200 },
              },
            },
          },
        },
      },
    },
    rules: [
      "content 与 layout 至少提供一个",
      "channelCode 优先于 category，且必须映射到已启用栏目",
      "layout 会自动渲染为带标题和要点列表的排版文本",
      "summary 缺省时由正文自动提炼",
      "originalUrl 可选，优先读取 article.originalUrl，也兼容顶层 originalUrl",
      "status 仅允许为 draft，外部推送不会直接发布",
    ],
    supportedChannels: supportedChannels.map((item) => ({
      code: item.code,
      name: item.name,
      description: item.description,
    })),
  });
});

articleRouter.post("/publish/token", async (request, response) => {
  const auth = validatePublishTokenClient(request.header("authorization"));
  if (!auth.ok) {
    if (auth.status === 401) {
      unauthorizedClient(response, auth.errorCode, auth.message);
      return;
    }
    response.status(auth.status).json({ message: auth.message });
    return;
  }
  const parsed = issueTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (
    env.articlePublishAllowedUserIds.length > 0 &&
    !env.articlePublishAllowedUserIds.includes(parsed.data.userId)
  ) {
    response.status(403).json({ message: "userId 无签发权限" });
    return;
  }
  const issued = issuePublishJwt(parsed.data.userId, parsed.data.ttlSeconds);
  if (!issued.ok) {
    response.status(issued.status).json({ message: issued.message });
    return;
  }
  response.status(201).json({
    tokenType: issued.tokenType,
    accessToken: issued.accessToken,
    expiresIn: issued.expiresIn,
    issuedAt: issued.issuedAt,
    expiresAt: issued.expiresAt,
    issuer: env.articlePublishJwtIssuer,
    audience: env.articlePublishJwtAudience,
    subject: parsed.data.userId,
    kid: issued.kid,
    algorithm: issued.algorithm,
    issueResult: {
      acceptedUserId: parsed.data.userId,
      acceptedClientId: auth.clientId,
    },
  });
});

articleRouter.post("/extract-from-url", requireContentHubOperator, async (request, response) => {
  const parsed = extractFromUrlSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  try {
    const result = await extractArticleFromUrl({
      url: parsed.data.url,
      requestUserId: request.session.user?.id,
    });
    response.json(result);
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 502;
    response.status(status).json({ message: (error as Error).message || "自动提取失败" });
  }
});

articleRouter.post("/ai-optimize", requireContentHubOperator, async (request, response) => {
  const parsed = aiOptimizeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  try {
    const result = await optimizeArticleDraft({
      ...parsed.data,
      originalUrl: parsed.data.originalUrl || undefined,
      requestUserId: request.session.user?.id,
    });
    response.json(result);
  } catch (error) {
    logger.error("article.ai_optimize.failed", {
      userId: request.session.user?.id,
      channelCode: parsed.data.channelCode || "",
      contentLength: parsed.data.content.length,
      error,
    });
    response.status(502).json({ message: "AI 优化失败，请重试" });
  }
});

articleRouter.get("/:id", requireAuth, async (request, response) => {
  const id = request.params.id.toString();
  const item = await articleStore.getById(id);
  if (!item) {
    response.status(404).json({ message: "文章不存在" });
    return;
  }
  response.json(item);
});

articleRouter.post("/", requireContentHubOperator, async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const currentUser = request.session.user;
  const payload = parsed.data;
  let channel: { code: string; name: string };
  try {
    channel = await resolveChannel(payload.channelCode, payload.category);
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
    return;
  }
  const item = await articleStore.create({
    ...payload,
    summary: payload.summary?.trim() || buildSummary(payload.content),
    sourceContent: payload.sourceContent?.trim(),
    originalUrl: payload.originalUrl?.trim(),
    publishedAt: payload.publishedAt?.trim(),
    channelCode: channel.code,
    category: channel.name,
    createdByUserId: currentUser?.id,
    author:
      payload.authorName?.trim() ||
      currentUser?.displayName ||
      currentUser?.username ||
      "未知用户",
  });
  if (item.status === "published") {
    await recordAnalyticsEventSafely({
      eventType: "article",
      eventName: "article_published",
      userId: item.createdByUserId,
      articleId: item.id,
      channelCode: item.channelCode,
      sourceModule: "articles.routes",
      eventPayload: {
        status: item.status,
      },
    });
  }
  triggerPublishedArticlePush(item);
  response.status(201).json(item);
});

articleRouter.post("/publish", async (request, response) => {
  const parsed = publishSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  const validation = validatePublishJwt(request.header("authorization"), payload.userId);
  if (!validation.ok) {
    if (validation.status === 401) {
      unauthorized(response, validation.errorCode, validation.message);
      return;
    }
    response.status(validation.status).json({ message: validation.message });
    return;
  }
  if (
    env.articlePublishAllowedUserIds.length > 0 &&
    !env.articlePublishAllowedUserIds.includes(payload.userId)
  ) {
    response.status(403).json({ message: "userId 无发布权限" });
    return;
  }
  const formattedContent = payload.article.layout
    ? buildContentFromLayout(payload.article.layout)
    : payload.article.content?.trim() ?? "";
  const summary = payload.article.summary?.trim() || buildSummary(formattedContent);
  let channel: { code: string; name: string };
  try {
    channel = await resolveChannel(payload.article.channelCode, payload.article.category);
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
    return;
  }
  const item = await articleStore.create({
    createdByUserId: payload.userId,
    title: payload.article.title.trim(),
    summary,
    content: formattedContent,
    sourceContent: payload.article.sourceContent?.trim(),
    originalUrl: payload.article.originalUrl?.trim() ?? payload.originalUrl?.trim(),
    publishedAt: payload.article.publishedAt?.trim(),
    channelCode: channel.code,
    category: channel.name,
    tags: payload.article.tags.map((tag) => tag.trim()),
    status: payload.article.status,
    author: payload.article.authorName?.trim() || `agent:${payload.userId}`,
  });
  if (item.status === "published") {
    await recordAnalyticsEventSafely({
      eventType: "article",
      eventName: "article_published",
      userId: payload.userId,
      articleId: item.id,
      channelCode: item.channelCode,
      sourceModule: "articles.routes",
      eventPayload: {
        status: item.status,
      },
    });
  }
  triggerPublishedArticlePush(item);
  response.status(201).json({
    article: item,
    publishResult: {
      acceptedUserId: payload.userId,
      acceptedKid: validation.kid,
      renderedBy: payload.article.layout ? "layout" : "plain-content",
    },
  });
});

articleRouter.patch("/:id", requireContentHubOperator, async (request, response) => {
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  const id = request.params.id.toString();
  const existing = await articleStore.getById(id);
  if (!existing) {
    response.status(404).json({ message: "文章不存在" });
    return;
  }
  let channelPatch: { channelCode?: string; category?: string } = {};
  if (payload.channelCode || payload.category) {
    try {
      const channel = await resolveChannel(payload.channelCode, payload.category);
      channelPatch = { channelCode: channel.code, category: channel.name };
    } catch (error) {
      response.status(400).json({ message: (error as Error).message });
      return;
    }
  }
  const authorPatch = payload.authorName?.trim()
    ? { author: payload.authorName.trim() }
    : {};
  const item = await articleStore.update(id, {
    ...payload,
    ...authorPatch,
    ...channelPatch,
  });
  if (!item) {
    response.status(404).json({ message: "文章不存在" });
    return;
  }
  if (existing.status !== "published" && item.status === "published") {
    await recordAnalyticsEventSafely({
      eventType: "article",
      eventName: "article_published",
      userId: item.createdByUserId,
      articleId: item.id,
      channelCode: item.channelCode,
      sourceModule: "articles.routes",
      eventPayload: {
        status: item.status,
      },
    });
    triggerPublishedArticlePush(item);
  }
  response.json(item);
});

articleRouter.delete("/:id", requireContentHubOperator, async (request, response) => {
  const id = request.params.id.toString();
  const removed = await articleStore.remove(id);
  if (!removed) {
    response.status(404).json({ message: "文章不存在" });
    return;
  }
  response.status(204).send();
});

// --- 用户标注（高亮 + 笔记）---

const createAnnotationSchema = z.object({
  selectedText: z.string().min(1).max(5000),
  note: z.string().max(2000).optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
});

const updateAnnotationSchema = z.object({
  note: z.string().max(2000).optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

articleRouter.get("/:id/annotations", requireAuth, async (request, response) => {
  const articleId = request.params.id.toString();
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const items = await annotationStore.listByArticle(userId, articleId);
  response.json({ items });
});

articleRouter.post("/:id/annotations", requireAuth, async (request, response) => {
  const articleId = request.params.id.toString();
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const parsed = createAnnotationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const item = await annotationStore.create({
    userId,
    articleId,
    ...parsed.data,
  });
  response.status(201).json(item);
});

articleRouter.patch("/:id/annotations/:annotationId", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const parsed = updateAnnotationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const item = await annotationStore.update(request.params.annotationId.toString(), userId, parsed.data);
  if (!item) {
    response.status(404).json({ message: "标注不存在" });
    return;
  }
  response.json(item);
});

articleRouter.delete("/:id/annotations/:annotationId", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const removed = await annotationStore.remove(request.params.annotationId.toString(), userId);
  if (!removed) {
    response.status(404).json({ message: "标注不存在" });
    return;
  }
  response.status(204).send();
});
