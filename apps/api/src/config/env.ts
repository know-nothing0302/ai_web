import dotenv from "dotenv";

dotenv.config();

const firstNonEmpty = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET ?? "ai-web-dev-secret",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:5173",
  casLoginUrl: process.env.CAS_LOGIN_URL ?? "",
  casValidateUrl: process.env.CAS_VALIDATE_URL ?? "",
  casServiceUrl: process.env.CAS_SERVICE_URL ?? "http://localhost:3000/api/auth/cas/callback",
  casLogoutUrl: process.env.CAS_LOGOUT_URL ?? "",
  devAuthBypass: (process.env.DEV_AUTH_BYPASS ?? "true") === "true",
  wecomAppCode: process.env.WECOM_APP_CODE ?? "default",
  wecomBaseUrl:
    process.env.WECOM_BASE_URL ?? "https://qyapi.weixin.qq.com/cgi-bin",
  wecomCorpId: process.env.WECOM_CORP_ID ?? process.env.WX_CORP_ID ?? "",
  wecomAgentId: toInt(process.env.WECOM_AGENT_ID ?? process.env.WX_AGENT_ID, 0),
  wecomSecret: process.env.WECOM_SECRET ?? "",
  wecomCallbackToken: process.env.WECOM_CALLBACK_TOKEN ?? "",
  wecomCallbackAesKey: process.env.WECOM_CALLBACK_AES_KEY ?? "",
  wecomInternalAuthToken: process.env.WECOM_INTERNAL_AUTH_TOKEN ?? "",
  feedbackExternalReadToken: process.env.FEEDBACK_EXTERNAL_READ_TOKEN ?? "",
  statsExternalReadToken: process.env.STATS_EXTERNAL_READ_TOKEN ?? "",
  wecomRequestTimeoutMs: toInt(process.env.WECOM_REQUEST_TIMEOUT_MS, 5000),
  wecomTokenRefreshSkewSeconds: toInt(
    process.env.WECOM_TOKEN_REFRESH_SKEW_SECONDS,
    300
  ),
  wecomTagSyncCron: process.env.WECOM_TAG_SYNC_CRON ?? "0 5 * * *",
  wecomTagNamePrefix: process.env.WECOM_TAG_NAME_PREFIX ?? "AI订阅",
  pushTimezone: process.env.PUSH_TIMEZONE ?? "Asia/Shanghai",
  dailyPushCron: process.env.DAILY_PUSH_CRON ?? "0 20 * * *",
  weeklyPushCron: process.env.WEEKLY_PUSH_CRON ?? "0 20 * * 0",
  deferredInstantPushCron: process.env.DEFERRED_INSTANT_PUSH_CRON ?? "0 8 * * *",
  instantPushWindowStartHour: toInt(process.env.INSTANT_PUSH_WINDOW_START_HOUR, 8),
  instantPushWindowEndHour: toInt(process.env.INSTANT_PUSH_WINDOW_END_HOUR, 20),
  aiXyApiUrl: firstNonEmpty(process.env.AI_XY_API_URL),
  aiXyApiKey: firstNonEmpty(process.env.AI_XY_API_KEY),
  deepseekApiBaseUrl: firstNonEmpty(
    process.env.DEEPSEEK_API_BASE_URL,
    process.env.AI_XY_API_URL
  ),
  deepseekApiKey: firstNonEmpty(process.env.DEEPSEEK_API_KEY, process.env.AI_XY_API_KEY),
  deepseekModel: firstNonEmpty(
    process.env.DEEPSEEK_MODEL,
    process.env.AI_XY_DEFAULT_GPT_TYPE,
    "deepseek-chat"
  ),
  pageAgentDebug: (process.env.PAGE_AGENT_DEBUG ?? "true") === "true",
  aiXyDefaultUserId: process.env.AI_XY_DEFAULT_USER_ID ?? "100002013029",
  aiXyDefaultKnowledgeGptId: process.env.AI_XY_DEFAULT_KNOWLEDGE_GPT_ID ?? "2550",
  aiXyDefaultChatType: process.env.AI_XY_DEFAULT_CHAT_TYPE ?? "ZSH_CHAT",
  aiXyDefaultGptType: process.env.AI_XY_DEFAULT_GPT_TYPE ?? "deepseekR1_zsh",
  articlePublishJwtIssuer: process.env.ARTICLE_PUBLISH_JWT_ISSUER ?? "ai_web_publish",
  articlePublishJwtAudience: process.env.ARTICLE_PUBLISH_JWT_AUDIENCE ?? "ai_web_articles",
  articlePublishJwtTtlSeconds: toInt(process.env.ARTICLE_PUBLISH_JWT_TTL_SECONDS, 900),
  articlePublishJwtMaxTtlSeconds: toInt(
    process.env.ARTICLE_PUBLISH_JWT_MAX_TTL_SECONDS,
    900
  ),
  articlePublishJwtActiveKid: process.env.ARTICLE_PUBLISH_JWT_ACTIVE_KID ?? "v1",
  articlePublishJwtPublicKeys: process.env.ARTICLE_PUBLISH_JWT_PUBLIC_KEYS ?? "",
  articlePublishJwtPrivateKeys: process.env.ARTICLE_PUBLISH_JWT_PRIVATE_KEYS ?? "",
  articlePublishTokenClients: process.env.ARTICLE_PUBLISH_TOKEN_CLIENTS ?? "",
  articlePublishAllowedUserIds: (process.env.ARTICLE_PUBLISH_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  postgresHost: process.env.POSTGRES_HOST ?? "localhost",
  postgresPort: toInt(process.env.POSTGRES_PORT, 5432),
  postgresUser: process.env.POSTGRES_USER ?? "postgres",
  postgresPassword: process.env.POSTGRES_PASSWORD ?? "",
  postgresDb: process.env.POSTGRES_DB ?? "ai_web",
};
