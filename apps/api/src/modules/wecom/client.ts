import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { wecomConfigStore } from "../../lib/store";
import { type WecomAppConfig } from "../../lib/types";
import { WecomApiError, WecomConfigError, isWecomTokenExpired } from "./errors";

interface WecomRuntimeConfig {
  appCode: string;
  corpId: string;
  agentId: number;
  secret: string;
  baseUrl: string;
  callbackToken?: string;
  callbackAesKey?: string;
  internalAuthToken?: string;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

interface WecomApiBaseResponse {
  errcode: number;
  errmsg: string;
}

interface WecomTokenResponse extends WecomApiBaseResponse {
  access_token?: string;
  expires_in?: number;
}

export interface WecomSendMessageResponse extends WecomApiBaseResponse {
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
  msgid?: string;
  response_code?: string;
}

interface WecomMessageTargetToUser {
  touser: string;
}

interface WecomMessageTargetToTag {
  totag: string;
}

type WecomMessageTarget = WecomMessageTargetToUser | WecomMessageTargetToTag;

interface WecomTextNoticeContentInput {
  title: string;
  summary: string;
  url: string;
  sourceDesc: string;
  author: string;
}

interface WecomNewsNoticeContentInput {
  title: string;
  summary: string;
  url: string;
  items: Array<{
    title: string;
    desc: string;
  }>;
}

export interface WecomTemplateCardRequest {
  touser?: string;
  toparty?: string;
  totag?: string;
  enableDuplicateCheck?: 0 | 1;
  duplicateCheckInterval?: number;
  templateCard: Record<string, unknown>;
}

type WecomSendMessageRequest = WecomMessageTarget & {
  msgtype: "template_card";
  agentid: number;
  enable_duplicate_check: 0 | 1;
  duplicate_check_interval: number;
  template_card: {
    card_type: "text_notice";
    source: {
      desc: string;
      desc_color: 0 | 1 | 2 | 3;
    };
    main_title: {
      title: string;
      desc: string;
    };
    sub_title_text: string;
    horizontal_content_list: Array<{
      keyname: string;
      value: string;
      type?: 1;
      url?: string;
    }>;
    card_action: {
      type: 1;
      url: string;
    };
  };
};

type WecomGenericTemplateCardRequest = {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: "template_card";
  agentid: number;
  enable_duplicate_check: 0 | 1;
  duplicate_check_interval: number;
  template_card: Record<string, unknown>;
};

interface WecomSendMessageResult {
  payload: WecomSendMessageRequest | WecomGenericTemplateCardRequest;
  result: WecomSendMessageResponse;
  attempt: number;
  invalidUserIds: string[];
}

interface WecomTagCreateResponse extends WecomApiBaseResponse {
  tagid?: number;
}

interface WecomTagListResponse extends WecomApiBaseResponse {
  taglist?: Array<{
    tagid: number;
    tagname: string;
  }>;
}

interface WecomTagGetResponse extends WecomApiBaseResponse {
  tagname?: string;
  userlist?: Array<{
    userid: string;
  }>;
}

interface WecomTagUsersResponse extends WecomApiBaseResponse {
  invalidlist?: string;
}

export interface WecomTagInfo {
  tagId: number;
  tagName: string;
}

export interface WecomTagMemberResult {
  tagId: number;
  tagName: string;
  userIds: string[];
  attempt: number;
}

export interface WecomTagUsersChangeResult {
  tagId: number;
  invalidUserIds: string[];
  attempt: number;
}

const CONFIG_CACHE_TTL_MS = 60 * 1000;
const MAX_API_ATTEMPTS = 3;
const tokenCache = new Map<string, TokenCacheEntry>();

let cachedConfig:
  | {
      expiresAt: number;
      config: WecomRuntimeConfig;
    }
  | undefined;

const httpClient: AxiosInstance = axios.create({
  timeout: env.wecomRequestTimeoutMs,
});

const trimToLength = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const maskSecret = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
};

const parsePipeList = (value?: string): string[] =>
  (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const webImageDirectory = "/opt/idapps/ai_web/apps/web/public/images";
let cachedWebImages:
  | {
      expiresAt: number;
      fileNames: string[];
    }
  | undefined;

const ensureMessageTarget = (input: {
  touser?: string;
  toparty?: string;
  totag?: string;
}): void => {
  if (input.touser || input.toparty || input.totag) {
    return;
  }
  throw new WecomConfigError("模板卡片发送目标不能为空，touser、toparty、totag 至少提供一个");
};

const getEnvConfig = (): Partial<WecomRuntimeConfig> => ({
  appCode: env.wecomAppCode,
  corpId: env.wecomCorpId,
  agentId: env.wecomAgentId,
  secret: env.wecomSecret,
  baseUrl: env.wecomBaseUrl,
  callbackToken: env.wecomCallbackToken || undefined,
  callbackAesKey: env.wecomCallbackAesKey || undefined,
  internalAuthToken: env.wecomInternalAuthToken || undefined,
});

const getRandomWebImageUrl = async (): Promise<string> => {
  if (!cachedWebImages || cachedWebImages.expiresAt <= Date.now()) {
    const fileNames = await readdir(webImageDirectory);
    cachedWebImages = {
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
      fileNames: fileNames.filter((fileName) => /\.(png|jpe?g|webp|gif)$/i.test(fileName)),
    };
  }
  const candidates = cachedWebImages.fileNames;
  if (candidates.length === 0) {
    throw new WecomConfigError(`未找到可用卡片图片，请检查目录 ${webImageDirectory}`);
  }
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
  return `${env.webBaseUrl.replace(/\/+$/, "")}/images/${encodeURIComponent(selected)}`;
};

const mergeConfig = (
  databaseConfig: WecomAppConfig | undefined,
  envConfig: Partial<WecomRuntimeConfig>
): WecomRuntimeConfig => {
  const appCode = databaseConfig?.appCode ?? envConfig.appCode ?? "default";
  const corpId = envConfig.corpId || databaseConfig?.corpId || "";
  const agentId = envConfig.agentId || databaseConfig?.agentId || 0;
  const secret = envConfig.secret || databaseConfig?.secret || "";
  const baseUrl = normalizeBaseUrl(
    envConfig.baseUrl ||
      databaseConfig?.baseUrl ||
      "https://qyapi.weixin.qq.com/cgi-bin"
  );
  if (!corpId || !agentId || !secret) {
    throw new WecomConfigError(
      "企业微信配置不完整，请检查 WECOM_CORP_ID、WECOM_AGENT_ID、WECOM_SECRET"
    );
  }
  return {
    appCode,
    corpId,
    agentId,
    secret,
    baseUrl,
    callbackToken:
      envConfig.callbackToken || databaseConfig?.callbackToken || undefined,
    callbackAesKey:
      envConfig.callbackAesKey || databaseConfig?.callbackAesKey || undefined,
    internalAuthToken:
      envConfig.internalAuthToken ||
      databaseConfig?.internalAuthToken ||
      undefined,
  };
};

const getRuntimeConfig = async (): Promise<WecomRuntimeConfig> => {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.config;
  }
  const databaseConfig = await wecomConfigStore.getEnabledConfig(env.wecomAppCode);
  const config = mergeConfig(databaseConfig, getEnvConfig());
  cachedConfig = {
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    config,
  };
  logger.info("wecom.config.loaded", {
    appCode: config.appCode,
    corpId: config.corpId,
    agentId: config.agentId,
    baseUrl: config.baseUrl,
    callbackToken: maskSecret(config.callbackToken),
    internalAuthToken: maskSecret(config.internalAuthToken),
  });
  return config;
};

const clearTokenCache = (appCode: string): void => {
  tokenCache.delete(appCode);
};

const getCachedToken = (appCode: string): string | undefined => {
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

const fetchAccessToken = async (
  config: WecomRuntimeConfig,
  forceRefresh = false
): Promise<string> => {
  if (!forceRefresh) {
    const cachedToken = getCachedToken(config.appCode);
    if (cachedToken) {
      return cachedToken;
    }
  }
  logger.info("wecom.token.fetch.start", {
    appCode: config.appCode,
    corpId: config.corpId,
    agentId: config.agentId,
  });
  let result: WecomTokenResponse;
  try {
    const response = await httpClient.get<WecomTokenResponse>(
      `${config.baseUrl}/gettoken`,
      {
        params: {
          corpid: config.corpId,
          corpsecret: config.secret,
        },
      }
    );
    result = response.data;
  } catch (error) {
    throw new WecomApiError("获取企业微信 access_token 失败", {
      endpoint: "/gettoken",
      attempt: 1,
      cause: error,
    });
  }
  if (result.errcode !== 0 || !result.access_token) {
    throw new WecomApiError("企业微信 access_token 返回异常", {
      endpoint: "/gettoken",
      attempt: 1,
      errcode: result.errcode,
      errmsg: result.errmsg,
      responseBody: result,
    });
  }
  const ttlSeconds = Math.max(
    (result.expires_in ?? 7200) - env.wecomTokenRefreshSkewSeconds,
    60
  );
  tokenCache.set(config.appCode, {
    token: result.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  logger.info("wecom.token.fetch.success", {
    appCode: config.appCode,
    expiresIn: result.expires_in ?? 7200,
    cacheTtlSeconds: ttlSeconds,
  });
  return result.access_token;
};

const requestWecom = async <T extends WecomApiBaseResponse>(
  config: WecomRuntimeConfig,
  requestConfig: AxiosRequestConfig,
  endpoint: string,
  attempt = 1
): Promise<{ data: T; attempt: number }> => {
  const accessToken = await fetchAccessToken(config, attempt > 1);
  const requestParams = {
    ...(requestConfig.params ?? {}),
    access_token: accessToken,
  };
  logger.info("wecom.request.start", {
    appCode: config.appCode,
    endpoint,
    method: requestConfig.method ?? "get",
    attempt,
  });
  let data: T;
  try {
    const response = await httpClient.request<T>({
      ...requestConfig,
      url: `${config.baseUrl}${endpoint}`,
      params: requestParams,
    });
    data = response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw new WecomApiError("企业微信接口请求失败", {
      endpoint,
      attempt,
      responseBody: axiosError.response?.data,
      cause: error,
    });
  }
  if (data.errcode !== 0) {
    if (isWecomTokenExpired(data.errcode) && attempt < MAX_API_ATTEMPTS) {
      clearTokenCache(config.appCode);
      logger.warn("wecom.request.retry.token_expired", {
        appCode: config.appCode,
        endpoint,
        attempt,
        errcode: data.errcode,
        errmsg: data.errmsg,
      });
      return requestWecom<T>(config, requestConfig, endpoint, attempt + 1);
    }
    throw new WecomApiError("企业微信接口返回失败", {
      endpoint,
      attempt,
      errcode: data.errcode,
      errmsg: data.errmsg,
      responseBody: data,
    });
  }
  logger.info("wecom.request.success", {
    appCode: config.appCode,
    endpoint,
    method: requestConfig.method ?? "get",
    attempt,
  });
  return { data, attempt };
};

const buildTextNoticePayload = (
  config: WecomRuntimeConfig,
  target: WecomMessageTarget,
  input: WecomTextNoticeContentInput
): WecomSendMessageRequest => ({
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

const sendTextNoticeCard = async (
  target: WecomMessageTarget,
  input: WecomTextNoticeContentInput
): Promise<WecomSendMessageResult> => {
  const config = await getRuntimeConfig();
  const payload = buildTextNoticePayload(config, target, input);
  const { data, attempt } = await requestWecom<WecomSendMessageResponse>(
    config,
    {
      method: "post",
      data: payload,
    },
    "/message/send"
  );
  return {
    payload,
    result: data,
    attempt,
    invalidUserIds: parsePipeList(data.invaliduser),
  };
};

const sendNewsNoticeCard = async (
  target: WecomMessageTarget,
  input: WecomNewsNoticeContentInput
): Promise<WecomSendMessageResult> => {
  const config = await getRuntimeConfig();
  const imageUrl = await getRandomWebImageUrl();
  const payload: WecomGenericTemplateCardRequest = {
    ...target,
    msgtype: "template_card",
    agentid: config.agentId,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800,
    template_card: {
      card_type: "news_notice",
      source: {
        desc: "AI在徐医",
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
  const { data, attempt } = await requestWecom<WecomSendMessageResponse>(
    config,
    {
      method: "post",
      data: payload,
    },
    "/message/send"
  );
  return {
    payload,
    result: data,
    attempt,
    invalidUserIds: parsePipeList(data.invaliduser),
  };
};

const sendTemplateCard = async (
  input: WecomTemplateCardRequest
): Promise<WecomSendMessageResult> => {
  ensureMessageTarget(input);
  const config = await getRuntimeConfig();
  const payload: WecomGenericTemplateCardRequest = {
    touser: input.touser,
    toparty: input.toparty,
    totag: input.totag,
    msgtype: "template_card",
    agentid: config.agentId,
    enable_duplicate_check: input.enableDuplicateCheck ?? 1,
    duplicate_check_interval: input.duplicateCheckInterval ?? 1800,
    template_card: input.templateCard,
  };
  const { data, attempt } = await requestWecom<WecomSendMessageResponse>(
    config,
    {
      method: "post",
      data: payload,
    },
    "/message/send"
  );
  return {
    payload,
    result: data,
    attempt,
    invalidUserIds: parsePipeList(data.invaliduser),
  };
};

interface WecomMediaUploadResponse extends WecomApiBaseResponse {
  media_id?: string;
  created_at?: string;
}

export const wecomClient = {
  async sendTextNoticeCard(
    input: WecomTextNoticeContentInput & WecomMessageTargetToUser
  ): Promise<WecomSendMessageResult> {
    return sendTextNoticeCard({ touser: input.touser }, input);
  },
  async sendTextNoticeCardToUsers(
    input: WecomTextNoticeContentInput & { userIds: string[] }
  ): Promise<WecomSendMessageResult> {
    return sendTextNoticeCard({ touser: input.userIds.join("|") }, input);
  },
  async sendTextNoticeCardToTag(
    input: WecomTextNoticeContentInput & { tagId: number }
  ): Promise<WecomSendMessageResult> {
    return sendTextNoticeCard({ totag: String(input.tagId) }, input);
  },
  async sendNewsNoticeCard(
    input: WecomNewsNoticeContentInput & WecomMessageTargetToUser
  ): Promise<WecomSendMessageResult> {
    return sendNewsNoticeCard({ touser: input.touser }, input);
  },
  async sendNewsNoticeCardToUsers(
    input: WecomNewsNoticeContentInput & { userIds: string[] }
  ): Promise<WecomSendMessageResult> {
    return sendNewsNoticeCard({ touser: input.userIds.join("|") }, input);
  },
  async sendNewsNoticeCardToTag(
    input: WecomNewsNoticeContentInput & { tagId: number }
  ): Promise<WecomSendMessageResult> {
    return sendNewsNoticeCard({ totag: String(input.tagId) }, input);
  },
  async sendTemplateCard(input: WecomTemplateCardRequest): Promise<WecomSendMessageResult> {
    return sendTemplateCard(input);
  },
  async createTag(input: { tagName: string; tagId?: number }): Promise<WecomTagInfo> {
    const config = await getRuntimeConfig();
    const payload = {
      tagname: trimToLength(input.tagName, 32),
      ...(typeof input.tagId === "number" ? { tagid: input.tagId } : {}),
    };
    const { data } = await requestWecom<WecomTagCreateResponse>(
      config,
      {
        method: "post",
        data: payload,
      },
      "/tag/create"
    );
    const tagId = data.tagid ?? input.tagId;
    if (typeof tagId !== "number") {
      throw new WecomApiError("企业微信标签创建成功但未返回标签ID", {
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
  async listTags(): Promise<WecomTagInfo[]> {
    const config = await getRuntimeConfig();
    const { data } = await requestWecom<WecomTagListResponse>(
      config,
      { method: "get" },
      "/tag/list"
    );
    return (data.taglist ?? []).map((item) => ({
      tagId: item.tagid,
      tagName: item.tagname,
    }));
  },
  async getTagMembers(tagId: number): Promise<WecomTagMemberResult> {
    const config = await getRuntimeConfig();
    const { data, attempt } = await requestWecom<WecomTagGetResponse>(
      config,
      {
        method: "get",
        params: { tagid: tagId },
      },
      "/tag/get"
    );
    return {
      tagId,
      tagName: data.tagname ?? String(tagId),
      userIds: (data.userlist ?? [])
        .map((item) => item.userid.trim())
        .filter(Boolean),
      attempt,
    };
  },
  async addTagUsers(
    tagId: number,
    userIds: string[]
  ): Promise<WecomTagUsersChangeResult> {
    const config = await getRuntimeConfig();
    const payload = {
      tagid: tagId,
      userlist: userIds,
    };
    const { data, attempt } = await requestWecom<WecomTagUsersResponse>(
      config,
      {
        method: "post",
        data: payload,
      },
      "/tag/addtagusers"
    );
    return {
      tagId,
      invalidUserIds: parsePipeList(data.invalidlist),
      attempt,
    };
  },
  async removeTagUsers(
    tagId: number,
    userIds: string[]
  ): Promise<WecomTagUsersChangeResult> {
    const config = await getRuntimeConfig();
    const payload = {
      tagid: tagId,
      userlist: userIds,
    };
    const { data, attempt } = await requestWecom<WecomTagUsersResponse>(
      config,
      {
        method: "post",
        data: payload,
      },
      "/tag/deltagusers"
    );
    return {
      tagId,
      invalidUserIds: parsePipeList(data.invalidlist),
      attempt,
    };
  },
  resetConfigCache(): void {
    cachedConfig = undefined;
  },
  async uploadImage(filePath: string): Promise<string> {
    const config = await getRuntimeConfig();
    const accessToken = await fetchAccessToken(config);
    const buffer = await readFile(filePath);
    const blob = new Blob([buffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("media", blob, "birthday_card.png");
    const response = await httpClient.post<WecomMediaUploadResponse>(
      `${config.baseUrl}/media/upload`,
      formData,
      {
        params: { access_token: accessToken, type: "image" },
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    const data = response.data;
    if (data.errcode !== 0 || !data.media_id) {
      throw new WecomApiError("企业微信上传图片失败", {
        endpoint: "/media/upload",
        attempt: 1,
        errcode: data.errcode,
        errmsg: data.errmsg,
        responseBody: data,
      });
    }
    logger.info("wecom.media.upload.success", {
      mediaId: data.media_id,
    });
    return data.media_id;
  },
  async sendTextMessage(input: {
    touser: string;
    content: string;
  }): Promise<WecomSendMessageResult> {
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
    const { data, attempt } = await requestWecom<WecomSendMessageResponse>(
      config,
      { method: "post", data: payload },
      "/message/send"
    );
    return {
      payload: payload as unknown as WecomSendMessageRequest,
      result: data,
      attempt,
      invalidUserIds: parsePipeList(data.invaliduser),
    };
  },
  async sendImageMessage(input: {
    touser: string;
    mediaId: string;
  }): Promise<WecomSendMessageResult> {
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
    const { data, attempt } = await requestWecom<WecomSendMessageResponse>(
      config,
      { method: "post", data: payload },
      "/message/send"
    );
    return {
      payload: payload as unknown as WecomSendMessageRequest,
      result: data,
      attempt,
      invalidUserIds: parsePipeList(data.invaliduser),
    };
  },
};
