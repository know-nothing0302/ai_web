"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublishJwtSigningSpec = exports.validatePublishJwt = exports.issuePublishJwt = exports.validatePublishTokenClient = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const parseBearerToken = (headerValue) => {
    if (!headerValue) {
        return undefined;
    }
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim();
};
const parseBasicAuthorization = (headerValue) => {
    if (!headerValue) {
        return undefined;
    }
    const match = headerValue.match(/^Basic\s+(.+)$/i);
    if (!match?.[1]) {
        return undefined;
    }
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const separatorIndex = decoded.indexOf(":");
        if (separatorIndex < 1) {
            return undefined;
        }
        const clientId = decoded.slice(0, separatorIndex).trim();
        const clientSecret = decoded.slice(separatorIndex + 1).trim();
        if (!clientId || !clientSecret) {
            return undefined;
        }
        return { clientId, clientSecret };
    }
    catch {
        return undefined;
    }
};
const parseKidValueMap = (rawValue) => {
    const pairs = rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const result = {};
    pairs.forEach((pair) => {
        const separatorIndex = pair.indexOf(":");
        if (separatorIndex < 1) {
            return;
        }
        const kid = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (!kid || !value) {
            return;
        }
        result[kid] = value;
    });
    return result;
};
const decodeKeyMaterial = (rawValue) => {
    const normalized = rawValue.trim();
    if (!normalized) {
        return undefined;
    }
    if (normalized.startsWith("base64:")) {
        try {
            return Buffer.from(normalized.slice("base64:".length), "base64").toString("utf8");
        }
        catch {
            return undefined;
        }
    }
    return normalized.replace(/\\n/g, "\n");
};
const parseKeyRing = (rawValue) => {
    const parsed = parseKidValueMap(rawValue);
    const keys = {};
    Object.entries(parsed).forEach(([kid, encodedKey]) => {
        const key = decodeKeyMaterial(encodedKey);
        if (key) {
            keys[kid] = key;
        }
    });
    if (Object.keys(keys).length === 0) {
        return undefined;
    }
    const activeKid = env_1.env.articlePublishJwtActiveKid.trim();
    if (!activeKid || !keys[activeKid]) {
        return undefined;
    }
    return { activeKid, keys };
};
const parseTokenClients = () => parseKidValueMap(env_1.env.articlePublishTokenClients);
const verifyWithPublicKey = (token, publicKey, expectedSub) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, publicKey, {
            algorithms: ["RS256"],
            issuer: env_1.env.articlePublishJwtIssuer,
            audience: env_1.env.articlePublishJwtAudience,
            subject: expectedSub,
        });
        if (typeof decoded === "string") {
            return undefined;
        }
        if (typeof decoded.iat !== "number" || typeof decoded.exp !== "number") {
            return undefined;
        }
        return decoded;
    }
    catch {
        return undefined;
    }
};
const validatePublishTokenClient = (authorizationHeader) => {
    const clients = parseTokenClients();
    if (Object.keys(clients).length === 0) {
        return {
            ok: false,
            status: 500,
            errorCode: "server_misconfigured",
            message: "服务端未配置签发客户端凭据",
        };
    }
    const credentials = parseBasicAuthorization(authorizationHeader);
    if (!credentials) {
        return {
            ok: false,
            status: 401,
            errorCode: "invalid_client",
            message: "缺少或无效的 Basic 客户端凭据",
        };
    }
    const expectedSecret = clients[credentials.clientId];
    if (!expectedSecret || expectedSecret !== credentials.clientSecret) {
        return {
            ok: false,
            status: 401,
            errorCode: "invalid_client",
            message: "客户端凭据校验失败",
        };
    }
    return { ok: true, clientId: credentials.clientId };
};
exports.validatePublishTokenClient = validatePublishTokenClient;
const issuePublishJwt = (userId, ttlSeconds) => {
    const privateKeyRing = parseKeyRing(env_1.env.articlePublishJwtPrivateKeys);
    if (!privateKeyRing) {
        return { ok: false, status: 500, message: "服务端未配置可用私钥或 active kid 不匹配" };
    }
    const requestedTtl = ttlSeconds ?? env_1.env.articlePublishJwtTtlSeconds;
    if (requestedTtl <= 0) {
        return { ok: false, status: 400, message: "ttlSeconds 必须大于 0" };
    }
    if (requestedTtl > env_1.env.articlePublishJwtMaxTtlSeconds) {
        return {
            ok: false,
            status: 400,
            message: `ttlSeconds 超过上限 ${env_1.env.articlePublishJwtMaxTtlSeconds}`,
        };
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + requestedTtl;
    const accessToken = jsonwebtoken_1.default.sign({}, privateKeyRing.keys[privateKeyRing.activeKid], {
        algorithm: "RS256",
        keyid: privateKeyRing.activeKid,
        issuer: env_1.env.articlePublishJwtIssuer,
        audience: env_1.env.articlePublishJwtAudience,
        subject: userId,
        expiresIn: requestedTtl,
    });
    return {
        ok: true,
        kid: privateKeyRing.activeKid,
        algorithm: "RS256",
        tokenType: "Bearer",
        accessToken,
        expiresIn: requestedTtl,
        issuedAt,
        expiresAt,
    };
};
exports.issuePublishJwt = issuePublishJwt;
const validatePublishJwt = (authorizationHeader, expectedSub) => {
    const keyRing = parseKeyRing(env_1.env.articlePublishJwtPublicKeys);
    if (!keyRing) {
        return {
            ok: false,
            status: 500,
            errorCode: "server_misconfigured",
            message: "服务端未配置可用公钥或 active kid 不匹配",
        };
    }
    const token = parseBearerToken(authorizationHeader);
    if (!token) {
        return {
            ok: false,
            status: 401,
            errorCode: "invalid_token",
            message: "缺少 Bearer JWT",
        };
    }
    const decodedHeader = jsonwebtoken_1.default.decode(token, { complete: true });
    const kid = typeof decodedHeader === "object" ? decodedHeader?.header?.kid : undefined;
    if (typeof kid === "string" && keyRing.keys[kid]) {
        const payload = verifyWithPublicKey(token, keyRing.keys[kid], expectedSub);
        if (payload) {
            return { ok: true, kid, payload };
        }
        return {
            ok: false,
            status: 401,
            errorCode: "invalid_token",
            message: "JWT 校验失败",
        };
    }
    const keyIds = Object.keys(keyRing.keys);
    for (const keyId of keyIds) {
        const payload = verifyWithPublicKey(token, keyRing.keys[keyId], expectedSub);
        if (payload) {
            return { ok: true, kid: keyId, payload };
        }
    }
    return {
        ok: false,
        status: 401,
        errorCode: "invalid_token",
        message: "JWT 校验失败",
    };
};
exports.validatePublishJwt = validatePublishJwt;
const getPublishJwtSigningSpec = () => {
    const publicKeyRing = parseKeyRing(env_1.env.articlePublishJwtPublicKeys);
    const privateKeyRing = parseKeyRing(env_1.env.articlePublishJwtPrivateKeys);
    const tokenClients = parseTokenClients();
    return {
        algorithm: "RS256",
        issuer: env_1.env.articlePublishJwtIssuer,
        audience: env_1.env.articlePublishJwtAudience,
        ttlSeconds: env_1.env.articlePublishJwtTtlSeconds,
        maxTtlSeconds: env_1.env.articlePublishJwtMaxTtlSeconds,
        activeKid: privateKeyRing?.activeKid ??
            publicKeyRing?.activeKid ??
            env_1.env.articlePublishJwtActiveKid,
        publicKeyCount: publicKeyRing ? Object.keys(publicKeyRing.keys).length : 0,
        privateKeyCount: privateKeyRing ? Object.keys(privateKeyRing.keys).length : 0,
        tokenClientCount: Object.keys(tokenClients).length,
        tokenEndpoint: "/api/articles/publish/token",
    };
};
exports.getPublishJwtSigningSpec = getPublishJwtSigningSpec;
