"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const strict_1 = __importDefault(require("node:assert/strict"));
const axios_1 = __importDefault(require("axios"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const toBase64 = (value) => Buffer.from(value, "utf8").toString("base64");
const buildKeyPair = () => {
    const pair = (0, node_crypto_1.generateKeyPairSync)("rsa", { modulusLength: 2048 });
    const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    return { publicPem, privatePem };
};
const buildJwtKeyEnv = (activeKid, keys, privateKids) => {
    const publicKeys = Object.entries(keys)
        .map(([kid, pair]) => `${kid}:base64:${Buffer.from(pair.publicPem, "utf8").toString("base64")}`)
        .join(",");
    const privateKeys = privateKids
        .map((kid) => `${kid}:base64:${Buffer.from(keys[kid].privatePem, "utf8").toString("base64")}`)
        .join(",");
    return {
        activeKid,
        publicKeys,
        privateKeys,
    };
};
const assertStatus = (actual, expected, context, body) => {
    strict_1.default.equal(actual, expected, `${context} status=${actual} body=${JSON.stringify(body)}`);
};
const run = async () => {
    const v1 = buildKeyPair();
    const v2 = buildKeyPair();
    const jwtKeys = buildJwtKeyEnv("v2", {
        v1,
        v2,
    }, ["v2"]);
    process.env.ARTICLE_PUBLISH_JWT_ISSUER = "ai_web_publish_test";
    process.env.ARTICLE_PUBLISH_JWT_AUDIENCE = "ai_web_articles_test";
    process.env.ARTICLE_PUBLISH_JWT_TTL_SECONDS = "900";
    process.env.ARTICLE_PUBLISH_JWT_MAX_TTL_SECONDS = "900";
    process.env.ARTICLE_PUBLISH_JWT_ACTIVE_KID = jwtKeys.activeKid;
    process.env.ARTICLE_PUBLISH_JWT_PUBLIC_KEYS = jwtKeys.publicKeys;
    process.env.ARTICLE_PUBLISH_JWT_PRIVATE_KEYS = jwtKeys.privateKeys;
    process.env.ARTICLE_PUBLISH_TOKEN_CLIENTS = "workbuddy:test-secret";
    process.env.ARTICLE_PUBLISH_ALLOWED_USER_IDS = "100002";
    process.env.DEV_AUTH_BYPASS = "true";
    const { initDb, closeDb } = await import("../lib/db.js");
    const { app } = await import("../app.js");
    await initDb();
    const server = app.listen(0);
    await new Promise((resolve) => {
        server.once("listening", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("测试服务端口获取失败");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const basic = `Basic ${toBase64("workbuddy:test-secret")}`;
    try {
        const publishSpec = await axios_1.default.get(`${baseUrl}/api/articles/publish/spec`, {
            validateStatus: () => true,
        });
        assertStatus(publishSpec.status, 200, "publish spec", publishSpec.data);
        strict_1.default.equal(publishSpec.data.auth.algorithm, "RS256");
        strict_1.default.equal(publishSpec.data.tokenIssue.endpoint, "/api/articles/publish/token");
        const missingTokenClient = await axios_1.default.post(`${baseUrl}/api/articles/publish/token`, { userId: "100002", ttlSeconds: 300 }, { validateStatus: () => true });
        assertStatus(missingTokenClient.status, 401, "missing basic auth", missingTokenClient.data);
        const badClient = await axios_1.default.post(`${baseUrl}/api/articles/publish/token`, { userId: "100002", ttlSeconds: 300 }, {
            headers: { Authorization: `Basic ${toBase64("workbuddy:wrong-secret")}` },
            validateStatus: () => true,
        });
        assertStatus(badClient.status, 401, "bad client", badClient.data);
        const overTtl = await axios_1.default.post(`${baseUrl}/api/articles/publish/token`, { userId: "100002", ttlSeconds: 1200 }, {
            headers: { Authorization: basic },
            validateStatus: () => true,
        });
        assertStatus(overTtl.status, 400, "ttl exceeds max", overTtl.data);
        const forbiddenUser = await axios_1.default.post(`${baseUrl}/api/articles/publish/token`, { userId: "100003", ttlSeconds: 300 }, {
            headers: { Authorization: basic },
            validateStatus: () => true,
        });
        assertStatus(forbiddenUser.status, 403, "forbidden user", forbiddenUser.data);
        const issueToken = await axios_1.default.post(`${baseUrl}/api/articles/publish/token`, { userId: "100002", ttlSeconds: 300 }, {
            headers: { Authorization: basic },
            validateStatus: () => true,
        });
        assertStatus(issueToken.status, 201, "issue token", issueToken.data);
        strict_1.default.equal(issueToken.data.tokenType, "Bearer");
        strict_1.default.equal(issueToken.data.algorithm, "RS256");
        strict_1.default.equal(issueToken.data.subject, "100002");
        strict_1.default.equal(issueToken.data.kid, "v2");
        const accessToken = issueToken.data.accessToken;
        strict_1.default.ok(accessToken.length > 20);
        const missingBearer = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: { title: "缺少token", category: "测试", content: "body" },
        }, { validateStatus: () => true });
        assertStatus(missingBearer.status, 401, "missing bearer token", missingBearer.data);
        const malformedBearer = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: { title: "坏token", category: "测试", content: "body" },
        }, {
            headers: { Authorization: "Bearer bad.token.value" },
            validateStatus: () => true,
        });
        assertStatus(malformedBearer.status, 401, "malformed bearer token", malformedBearer.data);
        const expiredToken = jsonwebtoken_1.default.sign({}, v2.privatePem, {
            algorithm: "RS256",
            keyid: "v2",
            issuer: "ai_web_publish_test",
            audience: "ai_web_articles_test",
            subject: "100002",
            expiresIn: -10,
        });
        const publishWithExpiredToken = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: { title: "过期token", category: "测试", content: "body" },
        }, {
            headers: { Authorization: `Bearer ${expiredToken}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithExpiredToken.status, 401, "publish with expired token", publishWithExpiredToken.data);
        const wrongAudienceToken = jsonwebtoken_1.default.sign({}, v2.privatePem, {
            algorithm: "RS256",
            keyid: "v2",
            issuer: "ai_web_publish_test",
            audience: "wrong_audience",
            subject: "100002",
            expiresIn: 300,
        });
        const publishWithWrongAudience = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: { title: "错误aud", category: "测试", content: "body" },
        }, {
            headers: { Authorization: `Bearer ${wrongAudienceToken}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithWrongAudience.status, 401, "publish with wrong audience token", publishWithWrongAudience.data);
        const invalidSubPublish = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100003",
            article: { title: "x", category: "c", content: "body" },
        }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            validateStatus: () => true,
        });
        assertStatus(invalidSubPublish.status, 401, "publish with mismatched sub", invalidSubPublish.data);
        const publish = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: {
                title: "测试文章",
                channelCode: "policy-ethics",
                tags: ["接口", "验签"],
                status: "draft",
                layout: {
                    lead: "先签发，再发布。",
                    sections: [
                        {
                            heading: "验证",
                            body: ["token 获取成功", "发布成功"],
                            highlights: ["RS256", "服务端签发"],
                        },
                    ],
                    conclusion: "测试完成",
                },
            },
        }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            validateStatus: () => true,
        });
        assertStatus(publish.status, 201, "publish success", publish.data);
        strict_1.default.equal(publish.data.publishResult.acceptedUserId, "100002");
        strict_1.default.equal(publish.data.publishResult.acceptedKid, "v2");
        strict_1.default.equal(publish.data.article.status, "draft");
        strict_1.default.equal(publish.data.article.publishedAt, undefined);
        const explicitPublishedAt = "2026-01-29T08:00:00.000Z";
        const publishWithPublishedAt = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: {
                title: "真实发布时间测试",
                channelCode: "policy-ethics",
                content: "发布时间应来自外部传入",
                publishedAt: explicitPublishedAt,
            },
        }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithPublishedAt.status, 201, "publish with explicit publishedAt", publishWithPublishedAt.data);
        strict_1.default.equal(publishWithPublishedAt.data.article.publishedAt, explicitPublishedAt);
        const updatedToDraft = await axios_1.default.patch(`${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`, { status: "draft" }, { validateStatus: () => true });
        assertStatus(updatedToDraft.status, 200, "set draft keeps publishedAt", updatedToDraft.data);
        strict_1.default.equal(updatedToDraft.data.publishedAt, explicitPublishedAt);
        const updatedToPublished = await axios_1.default.patch(`${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`, { status: "published" }, { validateStatus: () => true });
        assertStatus(updatedToPublished.status, 200, "set published keeps publishedAt", updatedToPublished.data);
        strict_1.default.equal(updatedToPublished.data.publishedAt, explicitPublishedAt);
        const updatedAuthor = await axios_1.default.patch(`${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`, { authorName: "内容中枢编辑" }, { validateStatus: () => true });
        assertStatus(updatedAuthor.status, 200, "update author by authorName", updatedAuthor.data);
        strict_1.default.equal(updatedAuthor.data.author, "内容中枢编辑");
        const publishWithTopLevelOriginalUrl = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: {
                title: "顶层原文链接兼容测试",
                channelCode: "policy-ethics",
                content: "顶层 originalUrl 应兼容写入",
            },
            originalUrl: "https://example.com/source-article",
        }, {
            headers: { Authorization: `Bearer ${accessToken}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithTopLevelOriginalUrl.status, 201, "publish with top-level originalUrl", publishWithTopLevelOriginalUrl.data);
        strict_1.default.equal(publishWithTopLevelOriginalUrl.data.article.originalUrl, "https://example.com/source-article");
        const listArticles = await axios_1.default.get(`${baseUrl}/api/articles`, {
            validateStatus: () => true,
        });
        assertStatus(listArticles.status, 200, "list articles", listArticles.data);
        strict_1.default.equal(listArticles.data.items[0].id, publishWithTopLevelOriginalUrl.data.article.id);
        const legacyV1Token = jsonwebtoken_1.default.sign({}, v1.privatePem, {
            algorithm: "RS256",
            keyid: "v1",
            issuer: "ai_web_publish_test",
            audience: "ai_web_articles_test",
            subject: "100002",
            expiresIn: 300,
        });
        const publishWithLegacyToken = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: {
                title: "旧kid兼容测试",
                channelCode: "policy-ethics",
                content: "旧 token 在轮换窗口内应可继续发布",
            },
        }, {
            headers: { Authorization: `Bearer ${legacyV1Token}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithLegacyToken.status, 201, "publish with legacy v1 token during rotation window", publishWithLegacyToken.data);
        strict_1.default.equal(publishWithLegacyToken.data.publishResult.acceptedKid, "v1");
        const forgedLegacyToken = jsonwebtoken_1.default.sign({}, v2.privatePem, {
            algorithm: "RS256",
            keyid: "v1",
            issuer: "ai_web_publish_test",
            audience: "ai_web_articles_test",
            subject: "100002",
            expiresIn: 300,
        });
        const publishWithForgedLegacyKid = await axios_1.default.post(`${baseUrl}/api/articles/publish`, {
            userId: "100002",
            article: {
                title: "伪造kid测试",
                channelCode: "policy-ethics",
                content: "签名与kid不匹配必须失败",
            },
        }, {
            headers: { Authorization: `Bearer ${forgedLegacyToken}` },
            validateStatus: () => true,
        });
        assertStatus(publishWithForgedLegacyKid.status, 401, "publish with forged legacy kid", publishWithForgedLegacyKid.data);
        const deleteArticle = await axios_1.default.delete(`${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`, { validateStatus: () => true });
        assertStatus(deleteArticle.status, 204, "delete article", deleteArticle.data);
        const getDeletedArticle = await axios_1.default.get(`${baseUrl}/api/articles/${publishWithPublishedAt.data.article.id}`, { validateStatus: () => true });
        assertStatus(getDeletedArticle.status, 404, "deleted article not found", getDeletedArticle.data);
        process.stdout.write("publish flow test passed\n");
    }
    finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        await closeDb();
    }
};
run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
