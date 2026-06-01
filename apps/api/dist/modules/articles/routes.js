"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.articleRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const auth_1 = require("../../middleware/auth");
const store_1 = require("../../lib/store");
const service_1 = require("../push/service");
const publish_jwt_1 = require("./publish_jwt");
const ai_optimize_service_1 = require("./ai_optimize_service");
const url_extract_service_1 = require("./url_extract_service");
const originalUrlSchema = zod_1.z.string().trim().url().max(1000).optional();
const publishedAtSchema = zod_1.z.string().trim().datetime().optional();
const createSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    summary: zod_1.z.string().trim().min(1).optional(),
    content: zod_1.z.string().min(1),
    sourceContent: zod_1.z.string().trim().min(1).optional(),
    authorName: zod_1.z.string().trim().min(1).max(80).optional(),
    originalUrl: originalUrlSchema,
    publishedAt: publishedAtSchema,
    channelCode: zod_1.z.string().trim().min(1).max(64).optional(),
    category: zod_1.z.string().trim().min(1).max(120).optional(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    status: zod_1.z.enum(["draft", "published"]).default("draft"),
});
const updateSchema = createSchema.partial();
const sectionSchema = zod_1.z.object({
    heading: zod_1.z.string().trim().min(1).max(80).optional(),
    body: zod_1.z.array(zod_1.z.string().trim().min(1).max(1200)).min(1).max(8).default([]),
    highlights: zod_1.z.array(zod_1.z.string().trim().min(1).max(300)).max(8).default([]),
});
const layoutSchema = zod_1.z.object({
    lead: zod_1.z.string().trim().min(1).max(1200).optional(),
    sections: zod_1.z.array(sectionSchema).min(1).max(20),
    conclusion: zod_1.z.string().trim().min(1).max(1200).optional(),
});
const publishSchema = zod_1.z
    .object({
    userId: zod_1.z.string().trim().min(1).max(64),
    originalUrl: originalUrlSchema,
    article: zod_1.z.object({
        title: zod_1.z.string().trim().min(1).max(180),
        channelCode: zod_1.z.string().trim().min(1).max(64).optional(),
        category: zod_1.z.string().trim().min(1).max(120).optional(),
        tags: zod_1.z.array(zod_1.z.string().trim().min(1).max(40)).max(20).default([]),
        status: zod_1.z.enum(["draft"]).default("draft"),
        summary: zod_1.z.string().trim().min(1).max(400).optional(),
        content: zod_1.z.string().trim().min(1).optional(),
        sourceContent: zod_1.z.string().trim().min(1).optional(),
        originalUrl: originalUrlSchema,
        publishedAt: publishedAtSchema,
        layout: layoutSchema.optional(),
        authorName: zod_1.z.string().trim().min(1).max(80).optional(),
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
const issueTokenSchema = zod_1.z.object({
    userId: zod_1.z.string().trim().min(1).max(64),
    ttlSeconds: zod_1.z.number().int().min(1).optional(),
});
const extractFromUrlSchema = zod_1.z.object({
    url: zod_1.z.string().trim().url().max(1000),
});
const aiOptimizeSchema = zod_1.z.object({
    title: zod_1.z.string().trim().max(180).optional(),
    content: zod_1.z.string().trim().min(1),
    summary: zod_1.z.string().trim().max(400).optional(),
    channelCode: zod_1.z.string().trim().max(64).optional(),
    originalUrl: zod_1.z.string().trim().url().max(1000).optional().or(zod_1.z.literal("")),
});
const unauthorized = (response, errorCode, description) => {
    const headerDescription = encodeURIComponent(description);
    response.setHeader("WWW-Authenticate", `Bearer realm="article-publish", error="${errorCode}", error_description="${headerDescription}"`);
    response.status(401).json({ message: description });
};
const unauthorizedClient = (response, errorCode, description) => {
    const headerDescription = encodeURIComponent(description);
    response.setHeader("WWW-Authenticate", `Basic realm="article-publish-token", error="${errorCode}", error_description="${headerDescription}"`);
    response.status(401).json({ message: description });
};
const buildContentFromLayout = (layout) => {
    const lines = [];
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
const buildSummary = (rawContent) => {
    const normalized = rawContent.replace(/\s+/g, " ").trim();
    if (normalized.length <= 160) {
        return normalized;
    }
    return `${normalized.slice(0, 157)}...`;
};
const categoryToChannelCode = {
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
const resolveChannel = async (channelCode, category) => {
    const normalizedCode = channelCode?.trim();
    const normalizedCategory = category?.trim();
    const fallbackCode = normalizedCategory ? categoryToChannelCode[normalizedCategory] : undefined;
    const finalCode = normalizedCode || fallbackCode;
    if (!finalCode) {
        throw new Error("缺少有效栏目标识");
    }
    const channel = await store_1.articleChannelStore.getByCode(finalCode);
    if (!channel || !channel.enabled) {
        throw new Error("栏目不存在或已停用");
    }
    return { code: channel.code, name: channel.name };
};
const triggerPublishedArticlePush = (article) => {
    if (article.status !== "published") {
        return;
    }
    void service_1.pushService.handleArticlePublished(article).catch((error) => {
        logger_1.logger.error("article.publish.push.failed", {
            articleId: article.id,
            channelCode: article.channelCode,
            error,
        });
    });
};
exports.articleRouter = (0, express_1.Router)();
exports.articleRouter.get("/", auth_1.requireAuth, async (request, response) => {
    const channelCode = request.query.channelCode?.toString();
    const category = request.query.category?.toString();
    const keyword = request.query.keyword?.toString();
    const status = request.query.status?.toString();
    const list = await store_1.articleStore.list({
        channelCode,
        category,
        keyword,
        status: status === "draft" || status === "published" ? status : undefined,
    });
    response.json({ items: list });
});
exports.articleRouter.get("/push-digests/today", auth_1.requireAuth, async (request, response) => {
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const subscriptions = await store_1.subscriptionStore.listByUser(userId);
    const targetUserIds = [
        userId,
        ...subscriptions.map((item) => item.qywxUserId),
    ];
    const items = await store_1.pushRecordStore.listTodayArticlesByUserIds(targetUserIds);
    response.json({
        date: new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }),
        total: items.length,
        items,
    });
});
exports.articleRouter.get("/publish/spec", async (_request, response) => {
    const jwtSpec = (0, publish_jwt_1.getPublishJwtSigningSpec)();
    const supportedChannels = await store_1.articleChannelStore.list(true);
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
exports.articleRouter.post("/publish/token", async (request, response) => {
    const auth = (0, publish_jwt_1.validatePublishTokenClient)(request.header("authorization"));
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
    if (env_1.env.articlePublishAllowedUserIds.length > 0 &&
        !env_1.env.articlePublishAllowedUserIds.includes(parsed.data.userId)) {
        response.status(403).json({ message: "userId 无签发权限" });
        return;
    }
    const issued = (0, publish_jwt_1.issuePublishJwt)(parsed.data.userId, parsed.data.ttlSeconds);
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
        issuer: env_1.env.articlePublishJwtIssuer,
        audience: env_1.env.articlePublishJwtAudience,
        subject: parsed.data.userId,
        kid: issued.kid,
        algorithm: issued.algorithm,
        issueResult: {
            acceptedUserId: parsed.data.userId,
            acceptedClientId: auth.clientId,
        },
    });
});
exports.articleRouter.post("/extract-from-url", auth_1.requireContentHubOperator, async (request, response) => {
    const parsed = extractFromUrlSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    try {
        const result = await (0, url_extract_service_1.extractArticleFromUrl)({
            url: parsed.data.url,
            requestUserId: request.session.user?.id,
        });
        response.json(result);
    }
    catch (error) {
        const status = error.status ?? 502;
        response.status(status).json({ message: error.message || "自动提取失败" });
    }
});
exports.articleRouter.post("/ai-optimize", auth_1.requireContentHubOperator, async (request, response) => {
    const parsed = aiOptimizeSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    try {
        const result = await (0, ai_optimize_service_1.optimizeArticleDraft)({
            ...parsed.data,
            originalUrl: parsed.data.originalUrl || undefined,
            requestUserId: request.session.user?.id,
        });
        response.json(result);
    }
    catch (error) {
        logger_1.logger.error("article.ai_optimize.failed", {
            userId: request.session.user?.id,
            channelCode: parsed.data.channelCode || "",
            contentLength: parsed.data.content.length,
            error,
        });
        response.status(502).json({ message: "AI 优化失败，请重试" });
    }
});
exports.articleRouter.get("/:id", auth_1.requireAuth, async (request, response) => {
    const id = request.params.id.toString();
    const item = await store_1.articleStore.getById(id);
    if (!item) {
        response.status(404).json({ message: "文章不存在" });
        return;
    }
    response.json(item);
});
exports.articleRouter.post("/", auth_1.requireContentHubOperator, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const currentUser = request.session.user;
    const payload = parsed.data;
    let channel;
    try {
        channel = await resolveChannel(payload.channelCode, payload.category);
    }
    catch (error) {
        response.status(400).json({ message: error.message });
        return;
    }
    const item = await store_1.articleStore.create({
        ...payload,
        summary: payload.summary?.trim() || buildSummary(payload.content),
        sourceContent: payload.sourceContent?.trim(),
        originalUrl: payload.originalUrl?.trim(),
        publishedAt: payload.publishedAt?.trim(),
        channelCode: channel.code,
        category: channel.name,
        createdByUserId: currentUser?.id,
        author: payload.authorName?.trim() ||
            currentUser?.displayName ||
            currentUser?.username ||
            "未知用户",
    });
    if (item.status === "published") {
        await (0, store_1.recordAnalyticsEventSafely)({
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
exports.articleRouter.post("/publish", async (request, response) => {
    const parsed = publishSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const payload = parsed.data;
    const validation = (0, publish_jwt_1.validatePublishJwt)(request.header("authorization"), payload.userId);
    if (!validation.ok) {
        if (validation.status === 401) {
            unauthorized(response, validation.errorCode, validation.message);
            return;
        }
        response.status(validation.status).json({ message: validation.message });
        return;
    }
    if (env_1.env.articlePublishAllowedUserIds.length > 0 &&
        !env_1.env.articlePublishAllowedUserIds.includes(payload.userId)) {
        response.status(403).json({ message: "userId 无发布权限" });
        return;
    }
    const formattedContent = payload.article.layout
        ? buildContentFromLayout(payload.article.layout)
        : payload.article.content?.trim() ?? "";
    const summary = payload.article.summary?.trim() || buildSummary(formattedContent);
    let channel;
    try {
        channel = await resolveChannel(payload.article.channelCode, payload.article.category);
    }
    catch (error) {
        response.status(400).json({ message: error.message });
        return;
    }
    const item = await store_1.articleStore.create({
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
        await (0, store_1.recordAnalyticsEventSafely)({
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
exports.articleRouter.patch("/:id", auth_1.requireContentHubOperator, async (request, response) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const payload = parsed.data;
    const id = request.params.id.toString();
    const existing = await store_1.articleStore.getById(id);
    if (!existing) {
        response.status(404).json({ message: "文章不存在" });
        return;
    }
    let channelPatch = {};
    if (payload.channelCode || payload.category) {
        try {
            const channel = await resolveChannel(payload.channelCode, payload.category);
            channelPatch = { channelCode: channel.code, category: channel.name };
        }
        catch (error) {
            response.status(400).json({ message: error.message });
            return;
        }
    }
    const authorPatch = payload.authorName?.trim()
        ? { author: payload.authorName.trim() }
        : {};
    const item = await store_1.articleStore.update(id, {
        ...payload,
        ...authorPatch,
        ...channelPatch,
    });
    if (!item) {
        response.status(404).json({ message: "文章不存在" });
        return;
    }
    if (existing.status !== "published" && item.status === "published") {
        await (0, store_1.recordAnalyticsEventSafely)({
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
exports.articleRouter.delete("/:id", auth_1.requireContentHubOperator, async (request, response) => {
    const id = request.params.id.toString();
    const removed = await store_1.articleStore.remove(id);
    if (!removed) {
        response.status(404).json({ message: "文章不存在" });
        return;
    }
    response.status(204).send();
});
// --- 用户标注（高亮 + 笔记）---
const createAnnotationSchema = zod_1.z.object({
    selectedText: zod_1.z.string().min(1).max(5000),
    note: zod_1.z.string().max(2000).optional(),
    color: zod_1.z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
    startOffset: zod_1.z.number().int().min(0),
    endOffset: zod_1.z.number().int().min(0),
});
const updateAnnotationSchema = zod_1.z.object({
    note: zod_1.z.string().max(2000).optional(),
    color: zod_1.z.enum(["yellow", "green", "blue", "pink"]).optional(),
});
exports.articleRouter.get("/:id/annotations", auth_1.requireAuth, async (request, response) => {
    const articleId = request.params.id.toString();
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const items = await store_1.annotationStore.listByArticle(userId, articleId);
    response.json({ items });
});
exports.articleRouter.post("/:id/annotations", auth_1.requireAuth, async (request, response) => {
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
    const item = await store_1.annotationStore.create({
        userId,
        articleId,
        ...parsed.data,
    });
    response.status(201).json(item);
});
exports.articleRouter.patch("/:id/annotations/:annotationId", auth_1.requireAuth, async (request, response) => {
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
    const item = await store_1.annotationStore.update(request.params.annotationId.toString(), userId, parsed.data);
    if (!item) {
        response.status(404).json({ message: "标注不存在" });
        return;
    }
    response.json(item);
});
exports.articleRouter.delete("/:id/annotations/:annotationId", auth_1.requireAuth, async (request, response) => {
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const removed = await store_1.annotationStore.remove(request.params.annotationId.toString(), userId);
    if (!removed) {
        response.status(404).json({ message: "标注不存在" });
        return;
    }
    response.status(204).send();
});
