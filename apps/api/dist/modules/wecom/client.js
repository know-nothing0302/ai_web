"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wecomClient = void 0;
const promises_1 = require("node:fs/promises");
const promises_2 = require("node:fs/promises");
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const errors_1 = require("./errors");
const CONFIG_CACHE_TTL_MS = 60 * 1000;
const MAX_API_ATTEMPTS = 3;
const tokenCache = new Map();
let cachedConfig;
const httpClient = axios_1.default.create({
    timeout: env_1.env.wecomRequestTimeoutMs,
});
const trimToLength = (value, maxLength) => {
    const normalized = value.trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return normalized.slice(0, maxLength);
};
const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");
const maskSecret = (value) => {
    if (!value) {
        return undefined;
    }
    if (value.length <= 8) {
        return "****";
    }
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
};
const parsePipeList = (value) => (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
const webImageDirectory = "/opt/idapps/ai_web/apps/web/public/images";
let cachedWebImages;
const ensureMessageTarget = (input) => {
    if (input.touser || input.toparty || input.totag) {
        return;
    }
    throw new errors_1.WecomConfigError("模板卡片发送目标不能为空，touser、toparty、totag 至少提供一个");
};
const getEnvConfig = () => ({
    appCode: env_1.env.wecomAppCode,
    corpId: env_1.env.wecomCorpId,
    agentId: env_1.env.wecomAgentId,
    secret: env_1.env.wecomSecret,
    baseUrl: env_1.env.wecomBaseUrl,
    callbackToken: env_1.env.wecomCallbackToken || undefined,
    callbackAesKey: env_1.env.wecomCallbackAesKey || undefined,
    internalAuthToken: env_1.env.wecomInternalAuthToken || undefined,
});
const getRandomWebImageUrl = async () => {
    if (!cachedWebImages || cachedWebImages.expiresAt <= Date.now()) {
        const fileNames = await (0, promises_2.readdir)(webImageDirectory);
        cachedWebImages = {
            expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
            fileNames: fileNames.filter((fileName) => /\.(png|jpe?g|webp|gif)$/i.test(fileName)),
        };
    }
    const candidates = cachedWebImages.fileNames;
    if (candidates.length === 0) {
        throw new errors_1.WecomConfigError(`未找到可用卡片图片，请检查目录 ${webImageDirectory}`);
    }
    const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
    return `${env_1.env.webBaseUrl.replace(/\/+$/, "")}/images/${encodeURIComponent(selected)}`;
};
const mergeConfig = (databaseConfig, envConfig) => {
    const appCode = databaseConfig?.appCode ?? envConfig.appCode ?? "default";
    const corpId = envConfig.corpId || databaseConfig?.corpId || "";
    const agentId = envConfig.agentId || databaseConfig?.agentId || 0;
    const secret = envConfig.secret || databaseConfig?.secret || "";
    const baseUrl = normalizeBaseUrl(envConfig.baseUrl ||
        databaseConfig?.baseUrl ||
        "https://qyapi.weixin.qq.com/cgi-bin");
    if (!corpId || !agentId || !secret) {
        throw new errors_1.WecomConfigError("企业微信配置不完整，请检查 WECOM_CORP_ID、WECOM_AGENT_ID、WECOM_SECRET");
    }
    return {
        appCode,
        corpId,
        agentId,
        secret,
        baseUrl,
        callbackToken: envConfig.callbackToken || databaseConfig?.callbackToken || undefined,
        callbackAesKey: envConfig.callbackAesKey || databaseConfig?.callbackAesKey || undefined,
        internalAuthToken: envConfig.internalAuthToken ||
            databaseConfig?.internalAuthToken ||
            undefined,
    };
};
const getRuntimeConfig = async () => {
    if (cachedConfig && cachedConfig.expiresAt > Date.now()) {
        return cachedConfig.config;
    }
    const databaseConfig = await store_1.wecomConfigStore.getEnabledConfig(env_1.env.wecomAppCode);
    const config = mergeConfig(databaseConfig, getEnvConfig());
    cachedConfig = {
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
        config,
    };
    logger_1.logger.info("wecom.config.loaded", {
        appCode: config.appCode,
        corpId: config.corpId,
        agentId: config.agentId,
        baseUrl: config.baseUrl,
        callbackToken: maskSecret(config.callbackToken),
        internalAuthToken: maskSecret(config.internalAuthToken),
    });
    return config;
};
const clearTokenCache = (appCode) => {
    tokenCache.delete(appCode);
};
const getCachedToken = (appCode) => {
    const entry = tokenCache.get(appCode);
    if (!entry) {
        return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
        tokenCache.delete(appCode);
        return undefined;
    }
    return entry.token;
};
const fetchAccessToken = async (config, forceRefresh = false) => {
    if (!forceRefresh) {
        const cachedToken = getCachedToken(config.appCode);
        if (cachedToken) {
            return cachedToken;
        }
    }
    logger_1.logger.info("wecom.token.fetch.start", {
        appCode: config.appCode,
        corpId: config.corpId,
        agentId: config.agentId,
    });
    let result;
    try {
        const response = await httpClient.get(`${config.baseUrl}/gettoken`, {
            params: {
                corpid: config.corpId,
                corpsecret: config.secret,
            },
        });
        result = response.data;
    }
    catch (error) {
        throw new errors_1.WecomApiError("获取企业微信 access_token 失败", {
            endpoint: "/gettoken",
            attempt: 1,
            cause: error,
        });
    }
    if (result.errcode !== 0 || !result.access_token) {
        throw new errors_1.WecomApiError("企业微信 access_token 返回异常", {
            endpoint: "/gettoken",
            attempt: 1,
            errcode: result.errcode,
            errmsg: result.errmsg,
            responseBody: result,
        });
    }
    const ttlSeconds = Math.max((result.expires_in ?? 7200) - env_1.env.wecomTokenRefreshSkewSeconds, 60);
    tokenCache.set(config.appCode, {
        token: result.access_token,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
    logger_1.logger.info("wecom.token.fetch.success", {
        appCode: config.appCode,
        expiresIn: result.expires_in ?? 7200,
        cacheTtlSeconds: ttlSeconds,
    });
    return result.access_token;
};
const requestWecom = async (config, requestConfig, endpoint, attempt = 1) => {
    const accessToken = await fetchAccessToken(config, attempt > 1);
    const requestParams = {
        ...(requestConfig.params ?? {}),
        access_token: accessToken,
    };
    logger_1.logger.info("wecom.request.start", {
        appCode: config.appCode,
        endpoint,
        method: requestConfig.method ?? "get",
        attempt,
    });
    let data;
    try {
        const response = await httpClient.request({
            ...requestConfig,
            url: `${config.baseUrl}${endpoint}`,
            params: requestParams,
        });
        data = response.data;
    }
    catch (error) {
        const axiosError = error;
        throw new errors_1.WecomApiError("企业微信接口请求失败", {
            endpoint,
            attempt,
            responseBody: axiosError.response?.data,
            cause: error,
        });
    }
    if (data.errcode !== 0) {
        if ((0, errors_1.isWecomTokenExpired)(data.errcode) && attempt < MAX_API_ATTEMPTS) {
            clearTokenCache(config.appCode);
            logger_1.logger.warn("wecom.request.retry.token_expired", {
                appCode: config.appCode,
                endpoint,
                attempt,
                errcode: data.errcode,
                errmsg: data.errmsg,
            });
            return requestWecom(config, requestConfig, endpoint, attempt + 1);
        }
        throw new errors_1.WecomApiError("企业微信接口返回失败", {
            endpoint,
            attempt,
            errcode: data.errcode,
            errmsg: data.errmsg,
            responseBody: data,
        });
    }
    logger_1.logger.info("wecom.request.success", {
        appCode: config.appCode,
        endpoint,
        method: requestConfig.method ?? "get",
        attempt,
    });
    return { data, attempt };
};
const buildTextNoticePayload = (config, target, input) => ({
    ...target,
    msgtype: "template_card",
    agentid: config.agentId,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
    template_card: {
        card_type: "text_notice",
        source: {
            desc: trimToLength(input.sourceDesc, 20),
            desc_color: 3,
        },
        main_title: {
            title: trimToLength(input.title, 36),
            desc: trimToLength(input.author, 44),
        },
        sub_title_text: trimToLength(input.summary, 160),
        horizontal_content_list: [
            {
                keyname: "作者",
                value: trimToLength(input.author, 30),
            },
            {
                keyname: "全文",
                value: "点击查看",
                type: 1,
                url: input.url,
            },
        ],
        card_action: {
            type: 1,
            url: input.url,
        },
    },
});
const sendTextNoticeCard = async (target, input) => {
    const config = await getRuntimeConfig();
    const payload = buildTextNoticePayload(config, target, input);
    const { data, attempt } = await requestWecom(config, {
        method: "post",
        data: payload,
    }, "/message/send");
    return {
        payload,
        result: data,
        attempt,
        invalidUserIds: parsePipeList(data.invaliduser),
    };
};
const sendNewsNoticeCard = async (target, input) => {
    const config = await getRuntimeConfig();
    const imageUrl = await getRandomWebImageUrl();
    const payload = {
        ...target,
        msgtype: "template_card",
        agentid: config.agentId,
        enable_duplicate_check: 1,
        duplicate_check_interval: 1800,
        template_card: {
            card_type: "news_notice",
            source: {
                desc: "AI徐医",
                desc_color: 0,
            },
            main_title: {
                title: trimToLength(input.title, 36),
                desc: trimToLength(input.summary, 44),
            },
            card_image: {
                url: imageUrl,
                aspect_ratio: 1.77,
            },
            vertical_content_list: input.items.slice(0, 4).map((item) => ({
                title: trimToLength(item.title, 38),
                desc: trimToLength(item.desc, 160),
            })),
            jump_list: [
                {
                    type: 1,
                    title: "点击查看详情",
                    url: input.url,
                },
            ],
            card_action: {
                type: 1,
                url: input.url,
            },
        },
    };
    const { data, attempt } = await requestWecom(config, {
        method: "post",
        data: payload,
    }, "/message/send");
    return {
        payload,
        result: data,
        attempt,
        invalidUserIds: parsePipeList(data.invaliduser),
    };
};
const sendTemplateCard = async (input) => {
    ensureMessageTarget(input);
    const config = await getRuntimeConfig();
    const payload = {
        touser: input.touser,
        toparty: input.toparty,
        totag: input.totag,
        msgtype: "template_card",
        agentid: config.agentId,
        enable_duplicate_check: input.enableDuplicateCheck ?? 1,
        duplicate_check_interval: input.duplicateCheckInterval ?? 1800,
        template_card: input.templateCard,
    };
    const { data, attempt } = await requestWecom(config, {
        method: "post",
        data: payload,
    }, "/message/send");
    return {
        payload,
        result: data,
        attempt,
        invalidUserIds: parsePipeList(data.invaliduser),
    };
};
exports.wecomClient = {
    async sendTextNoticeCard(input) {
        return sendTextNoticeCard({ touser: input.touser }, input);
    },
    async sendTextNoticeCardToUsers(input) {
        return sendTextNoticeCard({ touser: input.userIds.join("|") }, input);
    },
    async sendTextNoticeCardToTag(input) {
        return sendTextNoticeCard({ totag: String(input.tagId) }, input);
    },
    async sendNewsNoticeCard(input) {
        return sendNewsNoticeCard({ touser: input.touser }, input);
    },
    async sendNewsNoticeCardToUsers(input) {
        return sendNewsNoticeCard({ touser: input.userIds.join("|") }, input);
    },
    async sendNewsNoticeCardToTag(input) {
        return sendNewsNoticeCard({ totag: String(input.tagId) }, input);
    },
    async sendTemplateCard(input) {
        return sendTemplateCard(input);
    },
    async createTag(input) {
        const config = await getRuntimeConfig();
        const payload = {
            tagname: trimToLength(input.tagName, 32),
            ...(typeof input.tagId === "number" ? { tagid: input.tagId } : {}),
        };
        const { data } = await requestWecom(config, {
            method: "post",
            data: payload,
        }, "/tag/create");
        const tagId = data.tagid ?? input.tagId;
        if (typeof tagId !== "number") {
            throw new errors_1.WecomApiError("企业微信标签创建成功但未返回标签ID", {
                endpoint: "/tag/create",
                attempt: 1,
                responseBody: data,
            });
        }
        return {
            tagId,
            tagName: payload.tagname,
        };
    },
    async listTags() {
        const config = await getRuntimeConfig();
        const { data } = await requestWecom(config, { method: "get" }, "/tag/list");
        return (data.taglist ?? []).map((item) => ({
            tagId: item.tagid,
            tagName: item.tagname,
        }));
    },
    async getTagMembers(tagId) {
        const config = await getRuntimeConfig();
        const { data, attempt } = await requestWecom(config, {
            method: "get",
            params: { tagid: tagId },
        }, "/tag/get");
        return {
            tagId,
            tagName: data.tagname ?? String(tagId),
            userIds: (data.userlist ?? [])
                .map((item) => item.userid.trim())
                .filter(Boolean),
            attempt,
        };
    },
    async addTagUsers(tagId, userIds) {
        const config = await getRuntimeConfig();
        const payload = {
            tagid: tagId,
            userlist: userIds,
        };
        const { data, attempt } = await requestWecom(config, {
            method: "post",
            data: payload,
        }, "/tag/addtagusers");
        return {
            tagId,
            invalidUserIds: parsePipeList(data.invalidlist),
            attempt,
        };
    },
    async removeTagUsers(tagId, userIds) {
        const config = await getRuntimeConfig();
        const payload = {
            tagid: tagId,
            userlist: userIds,
        };
        const { data, attempt } = await requestWecom(config, {
            method: "post",
            data: payload,
        }, "/tag/deltagusers");
        return {
            tagId,
            invalidUserIds: parsePipeList(data.invalidlist),
            attempt,
        };
    },
    resetConfigCache() {
        cachedConfig = undefined;
    },
    async uploadImage(filePath) {
        const config = await getRuntimeConfig();
        const accessToken = await fetchAccessToken(config);
        const buffer = await (0, promises_1.readFile)(filePath);
        const blob = new Blob([buffer], { type: "image/png" });
        const formData = new FormData();
        formData.append("media", blob, "birthday_card.png");
        const response = await httpClient.post(`${config.baseUrl}/media/upload`, formData, {
            params: { access_token: accessToken, type: "image" },
            headers: { "Content-Type": "multipart/form-data" },
        });
        const data = response.data;
        if (data.errcode !== 0 || !data.media_id) {
            throw new errors_1.WecomApiError("企业微信上传图片失败", {
                endpoint: "/media/upload",
                attempt: 1,
                errcode: data.errcode,
                errmsg: data.errmsg,
                responseBody: data,
            });
        }
        logger_1.logger.info("wecom.media.upload.success", {
            mediaId: data.media_id,
        });
        return data.media_id;
    },
    async sendTextMessage(input) {
        const config = await getRuntimeConfig();
        const payload = {
            touser: input.touser,
            msgtype: "text",
            agentid: config.agentId,
            text: {
                content: input.content,
            },
            safe: 0,
        };
        const { data, attempt } = await requestWecom(config, { method: "post", data: payload }, "/message/send");
        return {
            payload: payload,
            result: data,
            attempt,
            invalidUserIds: parsePipeList(data.invaliduser),
        };
    },
    async sendImageMessage(input) {
        const config = await getRuntimeConfig();
        const payload = {
            touser: input.touser,
            msgtype: "image",
            agentid: config.agentId,
            image: {
                media_id: input.mediaId,
            },
            safe: 0,
        };
        const { data, attempt } = await requestWecom(config, { method: "post", data: payload }, "/message/send");
        return {
            payload: payload,
            result: data,
            attempt,
            invalidUserIds: parsePipeList(data.invaliduser),
        };
    },
};
