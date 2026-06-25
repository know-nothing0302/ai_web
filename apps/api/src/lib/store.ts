import {
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsEventType,
  Article,
  ArticleChannel,
  FeedbackEntry,
  FeedbackEvaluation,
  FeedbackStatus,
  FeedbackType,
  PageAgentConversation,
  PageAgentConversationStatus,
  PageAgentMessage,
  PageAgentMessageRole,
  PageAgentMessageType,
  ArticleStatus,
  PushDeliveryMode,
  PushRecord,
  PushRecordStatus,
  Subscription,
  Survey,
  SurveyResponse,
  SurveyStatus,
  TagSyncStatus,
  TodayPushedArticle,
  UserAnnotation,
  UserProfile,
  UserProfileAnalysisJob,
  UserProfileBehaviorSnapshot,
  UserProfileAnalysisJobStatus,
  UserProfileAnalysisTriggerMode,
  WecomAppConfig,
  WecomTagMapping,
} from "./types";
import { query } from "./db";
import { logger } from "./logger";

interface ArticleRow {
  id: string;
  created_by_user_id: string | null;
  title: string;
  summary: string;
  content: string;
  source_content: string | null;
  original_url: string | null;
  channel_code: string | null;
  channel_name?: string | null;
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  view_count?: string | null;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  channel_codes: string[];
  categories: string[];
  frequency: "daily" | "weekly" | "instant";
  qywx_user_id: string;
  qywx_user_name: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ArticleChannelRow {
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface WecomAppConfigRow {
  id: string;
  app_code: string;
  corp_id: string;
  agent_id: number;
  secret: string;
  callback_token: string | null;
  callback_aes_key: string | null;
  internal_auth_token: string | null;
  base_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface WecomTagMappingRow {
  id: string;
  channel_code: string;
  frequency: "daily" | "weekly" | "instant";
  tag_id: number;
  tag_name: string;
  enabled: boolean;
  last_sync_status: TagSyncStatus;
  last_sync_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PushRecordRow {
  id: string;
  article_id: string | null;
  channel_code: string;
  subscription_user_id: string | null;
  qywx_user_id: string;
  delivery_mode: PushDeliveryMode;
  wecom_tag_id: number | null;
  wecom_tag_name: string | null;
  message_type: string;
  title: string;
  summary: string;
  url: string;
  status: PushRecordStatus;
  retry_count: number;
  wecom_errcode: number | null;
  wecom_errmsg: string | null;
  wecom_msgid: string | null;
  response_code: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_detail: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TodayPushedArticleRow extends ArticleRow {
  push_record_id: string;
  sent_at: string;
}

interface PageAgentConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  page_type: string | null;
  route: string | null;
  page_title: string | null;
  status: PageAgentConversationStatus;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface PageAgentMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: PageAgentMessageRole;
  message_type: PageAgentMessageType;
  content: string;
  sanitized_content: string | null;
  page_type: string | null;
  route: string | null;
  page_title: string | null;
  context_payload: Record<string, unknown> | null;
  sources_payload: unknown[] | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  parent_message_id: string | null;
  feedback_score: number | null;
  feedback_tag: string | null;
  created_at: string;
}

interface UserProfileRow {
  id: string;
  user_id: string;
  profile_version: number;
  preference_summary: string;
  persona_prompt: string;
  interest_topics: string[];
  response_preferences: Record<string, unknown> | null;
  evidence_stats: Record<string, unknown> | null;
  last_analyzed_at: string | null;
  last_source_window_start: string | null;
  last_source_window_end: string | null;
  last_behavior_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface UserProfileAnalysisJobRow {
  id: string;
  trigger_mode: UserProfileAnalysisTriggerMode;
  target_user_id: string | null;
  status: UserProfileAnalysisJobStatus;
  processed_count: number;
  success_count: number;
  failed_count: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface FeedbackEntryRow {
  id: string;
  user_id: string;
  user_display_name: string | null;
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact: string | null;
  page_route: string;
  page_title: string;
  source: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface FeedbackEntryWithEvalRow extends FeedbackEntryRow {
  eval_type: string | null;
  severity: string | null;
  fix_scope: string | null;
  alignment: string | null;
  suggested_action: string | null;
  suggestion: string | null;
  detailed_analysis: string | null;
  evaluated_at: string | null;
}

interface AnalyticsEventRow {
  id: string;
  event_type: AnalyticsEventType;
  event_name: AnalyticsEventName;
  user_id: string | null;
  session_id: string | null;
  page_route: string | null;
  page_title: string | null;
  article_id: string | null;
  channel_code: string | null;
  source_module: string;
  event_payload: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

interface FeedbackListFilters {
  type?: FeedbackType;
  userId?: string;
  startAt?: string;
  endAt?: string;
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
  includeEval?: boolean;
}

interface FeedbackListResult {
  items: FeedbackEntry[];
  total: number;
}

const mapArticle = (row: ArticleRow): Article => ({
  id: row.id,
  createdByUserId: row.created_by_user_id ?? undefined,
  title: row.title,
  summary: row.summary,
  content: row.content,
  sourceContent: row.source_content ?? undefined,
  originalUrl: row.original_url ?? undefined,
  channelCode: row.channel_code ?? "daily-ai-summary",
  channelName: row.channel_name ?? undefined,
  category: row.channel_name ?? row.category,
  tags: row.tags ?? [],
  status: row.status,
  author: row.author,
  publishedAt: row.published_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  viewCount: row.view_count != null ? Number(row.view_count) : undefined,
});

const mapSubscription = (row: SubscriptionRow): Subscription => ({
  id: row.id,
  userId: row.user_id,
  channelCodes: row.channel_codes ?? [],
  categories: row.categories ?? [],
  frequency: row.frequency,
  qywxUserId: row.qywx_user_id,
  qywxUserName: row.qywx_user_name ?? undefined,
  enabled: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapArticleChannel = (row: ArticleChannelRow): ArticleChannel => ({
  code: row.code,
  name: row.name,
  description: row.description ?? undefined,
  sortOrder: row.sort_order,
  enabled: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWecomAppConfig = (row: WecomAppConfigRow): WecomAppConfig => ({
  id: row.id,
  appCode: row.app_code,
  corpId: row.corp_id,
  agentId: row.agent_id,
  secret: row.secret,
  callbackToken: row.callback_token ?? undefined,
  callbackAesKey: row.callback_aes_key ?? undefined,
  internalAuthToken: row.internal_auth_token ?? undefined,
  baseUrl: row.base_url,
  enabled: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapFeedbackEntry = (row: FeedbackEntryRow | FeedbackEntryWithEvalRow): FeedbackEntry => {
  const base = {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name ?? undefined,
    type: row.type,
    content: row.content,
    contact: row.contact ?? undefined,
    pageRoute: row.page_route,
    pageTitle: row.page_title,
    source: row.source,
    status: row.status as FeedbackStatus,
    adminNote: row.admin_note ?? undefined,
    createdAt: row.created_at,
  };
  const evalRow = row as FeedbackEntryWithEvalRow;
  if (evalRow.eval_type) {
    return {
      ...base,
      evaluation: {
        evalType: evalRow.eval_type,
        severity: evalRow.severity!,
        fixScope: evalRow.fix_scope!,
        alignment: evalRow.alignment!,
        suggestedAction: evalRow.suggested_action!,
        suggestion: evalRow.suggestion!,
        detailedAnalysis: evalRow.detailed_analysis ?? undefined,
        evaluatedAt: evalRow.evaluated_at!,
      },
    };
  }
  return base;
};

const mapAnalyticsEvent = (row: AnalyticsEventRow): AnalyticsEvent => ({
  id: row.id,
  eventType: row.event_type,
  eventName: row.event_name,
  userId: row.user_id ?? undefined,
  sessionId: row.session_id ?? undefined,
  pageRoute: row.page_route ?? undefined,
  pageTitle: row.page_title ?? undefined,
  articleId: row.article_id ?? undefined,
  channelCode: row.channel_code ?? undefined,
  sourceModule: row.source_module,
  eventPayload: row.event_payload ?? {},
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

const mapWecomTagMapping = (row: WecomTagMappingRow): WecomTagMapping => ({
  id: row.id,
  channelCode: row.channel_code,
  frequency: row.frequency,
  tagId: row.tag_id,
  tagName: row.tag_name,
  enabled: row.enabled,
  lastSyncStatus: row.last_sync_status,
  lastSyncError: row.last_sync_error ?? undefined,
  lastSyncedAt: row.last_synced_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPushRecord = (row: PushRecordRow): PushRecord => ({
  id: row.id,
  articleId: row.article_id ?? undefined,
  channelCode: row.channel_code,
  subscriptionUserId: row.subscription_user_id ?? undefined,
  qywxUserId: row.qywx_user_id,
  deliveryMode: row.delivery_mode,
  wecomTagId: row.wecom_tag_id ?? undefined,
  wecomTagName: row.wecom_tag_name ?? undefined,
  messageType: row.message_type,
  title: row.title,
  summary: row.summary,
  url: row.url,
  status: row.status,
  retryCount: row.retry_count,
  wecomErrcode: row.wecom_errcode ?? undefined,
  wecomErrmsg: row.wecom_errmsg ?? undefined,
  wecomMsgid: row.wecom_msgid ?? undefined,
  responseCode: row.response_code ?? undefined,
  requestPayload: row.request_payload ?? {},
  responsePayload: row.response_payload ?? {},
  errorDetail: row.error_detail ?? undefined,
  sentAt: row.sent_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPageAgentConversation = (
  row: PageAgentConversationRow
): PageAgentConversation => ({
  id: row.id,
  userId: row.user_id,
  title: row.title ?? undefined,
  pageType: row.page_type ?? undefined,
  route: row.route ?? undefined,
  pageTitle: row.page_title ?? undefined,
  status: row.status,
  lastMessageAt: row.last_message_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPageAgentMessage = (row: PageAgentMessageRow): PageAgentMessage => ({
  id: row.id,
  conversationId: row.conversation_id,
  userId: row.user_id,
  role: row.role,
  messageType: row.message_type,
  content: row.content,
  sanitizedContent: row.sanitized_content ?? undefined,
  pageType: row.page_type ?? undefined,
  route: row.route ?? undefined,
  pageTitle: row.page_title ?? undefined,
  contextPayload: row.context_payload ?? {},
  sourcesPayload: row.sources_payload ?? [],
  model: row.model ?? undefined,
  tokensInput: row.tokens_input ?? undefined,
  tokensOutput: row.tokens_output ?? undefined,
  parentMessageId: row.parent_message_id ?? undefined,
  feedbackScore: row.feedback_score ?? undefined,
  feedbackTag: row.feedback_tag ?? undefined,
  createdAt: row.created_at,
});

const mapUserProfile = (row: UserProfileRow): UserProfile => ({
  id: row.id,
  userId: row.user_id,
  profileVersion: row.profile_version,
  preferenceSummary: row.preference_summary,
  personaPrompt: row.persona_prompt,
  interestTopics: row.interest_topics ?? [],
  responsePreferences: row.response_preferences ?? {},
  evidenceStats: row.evidence_stats ?? {},
  lastAnalyzedAt: row.last_analyzed_at ?? undefined,
  lastSourceWindowStart: row.last_source_window_start ?? undefined,
  lastSourceWindowEnd: row.last_source_window_end ?? undefined,
  lastBehaviorSnapshot: (() => {
    const raw = row.last_behavior_snapshot;
    if (raw == null) return undefined;
    if (
      typeof raw === "object" &&
      Array.isArray((raw as Record<string, unknown>).channelCodes) &&
      typeof (raw as Record<string, unknown>).questionCount === "number"
    ) {
      return raw as unknown as UserProfileBehaviorSnapshot;
    }
    return undefined;
  })(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapUserProfileAnalysisJob = (
  row: UserProfileAnalysisJobRow
): UserProfileAnalysisJob => ({
  id: row.id,
  triggerMode: row.trigger_mode,
  targetUserId: row.target_user_id ?? undefined,
  status: row.status,
  processedCount: row.processed_count,
  successCount: row.success_count,
  failedCount: row.failed_count,
  errorMessage: row.error_message ?? undefined,
  startedAt: row.started_at ?? undefined,
  finishedAt: row.finished_at ?? undefined,
  createdAt: row.created_at,
});

export const articleChannelStore = {
  async list(enabledOnly = false): Promise<ArticleChannel[]> {
    const result = await query<ArticleChannelRow>(
      `
      SELECT
        code,
        name,
        description,
        sort_order,
        enabled,
        created_at,
        updated_at
      FROM article_channels
      ${enabledOnly ? "WHERE enabled = TRUE" : ""}
      ORDER BY sort_order ASC, created_at ASC
      `
    );
    return result.rows.map(mapArticleChannel);
  },
  async getByCode(code: string): Promise<ArticleChannel | undefined> {
    const result = await query<ArticleChannelRow>(
      `
      SELECT
        code,
        name,
        description,
        sort_order,
        enabled,
        created_at,
        updated_at
      FROM article_channels
      WHERE code = $1
      LIMIT 1
      `,
      [code]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapArticleChannel(result.rows[0]);
  },
};

export const articleStore = {
  async list(params: {
    channelCode?: string;
    category?: string;
    keyword?: string;
    status?: ArticleStatus;
  }): Promise<Article[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const discoverConditions: string[] = [];
    if (params.status) {
      values.push(params.status);
      conditions.push(`articles.status = $${values.length}`);
    }
    if (params.category) {
      values.push(params.category);
      discoverConditions.push(`articles.category = $${values.length}`);
    }
    if (params.channelCode) {
      values.push(params.channelCode);
      discoverConditions.push(`articles.channel_code = $${values.length}`);
    }
    if (params.keyword) {
      values.push(`%${params.keyword}%`);
      discoverConditions.push(
        `(articles.title ILIKE $${values.length} OR articles.summary ILIKE $${values.length} OR articles.content ILIKE $${values.length})`
      );
    }
    if (discoverConditions.length > 0) {
      conditions.push(`(${discoverConditions.join(" OR ")})`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query<ArticleRow>(
      `
      SELECT
        articles.id,
        articles.created_by_user_id,
        articles.title,
        articles.summary,
        articles.content,
        articles.source_content,
        articles.original_url,
        articles.channel_code,
        channels.name AS channel_name,
        articles.category,
        articles.tags,
        articles.status,
        articles.author,
        articles.published_at,
        articles.created_at,
        articles.updated_at
      FROM articles
      LEFT JOIN article_channels channels ON channels.code = articles.channel_code
      ${whereClause}
      ORDER BY articles.created_at DESC
      `,
      values
    );
    return result.rows.map(mapArticle);
  },
  async getById(id: string): Promise<Article | undefined> {
    const result = await query<ArticleRow>(
      `
      SELECT
        articles.id,
        articles.created_by_user_id,
        articles.title,
        articles.summary,
        articles.content,
        articles.source_content,
        articles.original_url,
        articles.channel_code,
        channels.name AS channel_name,
        articles.category,
        articles.tags,
        articles.status,
        articles.author,
        articles.published_at,
        articles.created_at,
        articles.updated_at,
        (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'article_view' AND article_id = articles.id)::text AS view_count
      FROM articles
      LEFT JOIN article_channels channels ON channels.code = articles.channel_code
      WHERE articles.id = $1
      LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapArticle(result.rows[0]);
  },
  async listPublishedWithin(input: {
    startAt: string;
    endAt: string;
  }): Promise<Article[]> {
    const result = await query<ArticleRow>(
      `
      SELECT
        articles.id,
        articles.created_by_user_id,
        articles.title,
        articles.summary,
        articles.content,
        articles.source_content,
        articles.original_url,
        articles.channel_code,
        channels.name AS channel_name,
        articles.category,
        articles.tags,
        articles.status,
        articles.author,
        articles.published_at,
        articles.created_at,
        articles.updated_at
      FROM articles
      LEFT JOIN article_channels channels ON channels.code = articles.channel_code
      WHERE articles.status = 'published'
        AND articles.published_at IS NOT NULL
        AND articles.published_at > $1
        AND articles.published_at <= $2
      ORDER BY articles.published_at DESC, articles.created_at DESC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map(mapArticle);
  },
  async listPublishedByCreatedWindow(input: {
    startAt: string;
    endAt: string;
  }): Promise<Article[]> {
    const result = await query<ArticleRow>(
      `
      SELECT
        articles.id,
        articles.created_by_user_id,
        articles.title,
        articles.summary,
        articles.content,
        articles.source_content,
        articles.original_url,
        articles.channel_code,
        channels.name AS channel_name,
        articles.category,
        articles.tags,
        articles.status,
        articles.author,
        articles.published_at,
        articles.created_at,
        articles.updated_at
      FROM articles
      LEFT JOIN article_channels channels ON channels.code = articles.channel_code
      WHERE articles.status = 'published'
        AND articles.created_at > $1
        AND articles.created_at <= $2
      ORDER BY articles.created_at DESC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map(mapArticle);
  },
  async create(input: Omit<Article, "id" | "createdAt" | "updatedAt">): Promise<Article> {
    const result = await query<ArticleRow>(
      `
      WITH inserted AS (
        INSERT INTO articles (
          created_by_user_id,
          title,
          summary,
          content,
          source_content,
          original_url,
          channel_code,
          category,
          tags,
          status,
          author,
          published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      )
      SELECT
        inserted.id,
        inserted.created_by_user_id,
        inserted.title,
        inserted.summary,
        inserted.content,
        inserted.source_content,
        inserted.original_url,
        inserted.channel_code,
        channels.name AS channel_name,
        inserted.category,
        inserted.tags,
        inserted.status,
        inserted.author,
        inserted.published_at,
        inserted.created_at,
        inserted.updated_at
      FROM inserted
      LEFT JOIN article_channels channels ON channels.code = inserted.channel_code
      `,
      [
        input.createdByUserId ?? null,
        input.title,
        input.summary,
        input.content,
        input.sourceContent ?? null,
        input.originalUrl ?? null,
        input.channelCode,
        input.category,
        input.tags,
        input.status,
        input.author,
        input.publishedAt ?? null,
      ]
    );
    return mapArticle(result.rows[0]);
  },
  async update(
    id: string,
    input: Partial<Omit<Article, "id" | "createdAt" | "updatedAt">>
  ): Promise<Article | undefined> {
    const values: unknown[] = [];
    const updates: string[] = [];
    if ("createdByUserId" in input) {
      values.push(input.createdByUserId ?? null);
      updates.push(`created_by_user_id = $${values.length}`);
    }
    if ("title" in input) {
      values.push(input.title);
      updates.push(`title = $${values.length}`);
    }
    if ("summary" in input) {
      values.push(input.summary);
      updates.push(`summary = $${values.length}`);
    }
    if ("content" in input) {
      values.push(input.content);
      updates.push(`content = $${values.length}`);
    }
    if ("sourceContent" in input) {
      values.push(input.sourceContent ?? null);
      updates.push(`source_content = $${values.length}`);
    }
    if ("originalUrl" in input) {
      values.push(input.originalUrl ?? null);
      updates.push(`original_url = $${values.length}`);
    }
    if ("channelCode" in input) {
      values.push(input.channelCode);
      updates.push(`channel_code = $${values.length}`);
    }
    if ("category" in input) {
      values.push(input.category);
      updates.push(`category = $${values.length}`);
    }
    if ("tags" in input) {
      values.push(input.tags);
      updates.push(`tags = $${values.length}`);
    }
    if ("status" in input) {
      values.push(input.status);
      updates.push(`status = $${values.length}`);
    }
    if ("author" in input) {
      values.push(input.author);
      updates.push(`author = $${values.length}`);
    }
    if ("publishedAt" in input) {
      values.push(input.publishedAt ?? null);
      updates.push(`published_at = $${values.length}`);
    }
    if (updates.length === 0) {
      return this.getById(id);
    }
    values.push(id);
    const result = await query<ArticleRow>(
      `
      UPDATE articles
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id
      `,
      values
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return this.getById(id);
  },
  async remove(id: string): Promise<boolean> {
    const result = await query<{ id: string }>(
      `
      DELETE FROM articles
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );
    return result.rows.length > 0;
  },
};

export const subscriptionStore = {
  async listByUser(userId: string): Promise<Subscription[]> {
    const result = await query<SubscriptionRow>(
      `
      SELECT
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      FROM subscriptions
      WHERE user_id = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );
    return result.rows.map(mapSubscription);
  },
  async upsertByUser(
    userId: string,
    input: Omit<Subscription, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<Subscription> {
    const result = await query<SubscriptionRow>(
      `
      INSERT INTO subscriptions (
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id)
      DO UPDATE SET
        channel_codes = EXCLUDED.channel_codes,
        categories = EXCLUDED.categories,
        frequency = EXCLUDED.frequency,
        qywx_user_id = EXCLUDED.qywx_user_id,
        qywx_user_name = EXCLUDED.qywx_user_name,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
      RETURNING
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      `,
      [
        userId,
        input.channelCodes,
        input.categories,
        input.frequency,
        input.qywxUserId,
        input.qywxUserName ?? null,
        input.enabled,
      ]
    );
    return mapSubscription(result.rows[0]);
  },
  async listEnabledByChannelCode(channelCode: string): Promise<Subscription[]> {
    const result = await query<SubscriptionRow>(
      `
      SELECT
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      FROM subscriptions
      WHERE enabled = TRUE AND $1 = ANY(channel_codes)
      ORDER BY updated_at DESC
      `,
      [channelCode]
    );
    return result.rows.map(mapSubscription);
  },
  async listEnabledByFrequency(
    frequency: "daily" | "weekly" | "instant"
  ): Promise<Subscription[]> {
    const result = await query<SubscriptionRow>(
      `
      SELECT
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      FROM subscriptions
      WHERE enabled = TRUE
        AND frequency = $1
      ORDER BY updated_at DESC
      `,
      [frequency]
    );
    return result.rows.map(mapSubscription);
  },
  async listEnabledByChannelCodeAndFrequency(
    channelCode: string,
    frequency: "daily" | "weekly" | "instant"
  ): Promise<Subscription[]> {
    const result = await query<SubscriptionRow>(
      `
      SELECT
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      FROM subscriptions
      WHERE enabled = TRUE
        AND frequency = $2
        AND $1 = ANY(channel_codes)
      ORDER BY updated_at DESC
      `,
      [channelCode, frequency]
    );
    return result.rows.map(mapSubscription);
  },
  async listAllEnabledUserIds(): Promise<string[]> {
    const result = await query<{ qywx_user_id: string }>(
      `
      SELECT DISTINCT qywx_user_id
      FROM subscriptions
      WHERE enabled = TRUE
        AND qywx_user_id IS NOT NULL
        AND qywx_user_id <> ''
      ORDER BY qywx_user_id
      `
    );
    return result.rows.map((row) => row.qywx_user_id);
  },
  async getEnabledByChannelCodeAndUserId(
    channelCode: string,
    userId: string,
    frequency?: "daily" | "weekly" | "instant"
  ): Promise<Subscription | undefined> {
    const values: unknown[] = [channelCode, userId];
    const conditions = [
      "enabled = TRUE",
      "$1 = ANY(channel_codes)",
      "user_id = $2",
    ];
    if (frequency) {
      values.push(frequency);
      conditions.push(`frequency = $${values.length}`);
    }
    const result = await query<SubscriptionRow>(
      `
      SELECT
        id,
        user_id,
        channel_codes,
        categories,
        frequency,
        qywx_user_id,
        qywx_user_name,
        enabled,
        created_at,
        updated_at
      FROM subscriptions
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      values
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapSubscription(result.rows[0]);
  },
};

export const pageAgentConversationStore = {
  async create(input: {
    userId: string;
    pageType?: string;
    route?: string;
    pageTitle?: string;
    title?: string;
  }): Promise<PageAgentConversation> {
    const result = await query<PageAgentConversationRow>(
      `
      INSERT INTO page_agent_conversations (
        user_id,
        page_type,
        route,
        page_title,
        title
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        input.userId,
        input.pageType ?? null,
        input.route ?? null,
        input.pageTitle ?? null,
        input.title ?? null,
      ]
    );
    return mapPageAgentConversation(result.rows[0]);
  },
  async getById(id: string): Promise<PageAgentConversation | undefined> {
    const result = await query<PageAgentConversationRow>(
      `
      SELECT *
      FROM page_agent_conversations
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapPageAgentConversation(result.rows[0]);
  },
  async listByUser(userId: string, limit: number, offset = 0): Promise<PageAgentConversation[]> {
    const result = await query<PageAgentConversationRow>(
      `
      SELECT *
      FROM page_agent_conversations
      WHERE user_id = $1
      ORDER BY last_message_at DESC
      LIMIT $2
      OFFSET $3
      `,
      [userId, Math.max(1, Math.min(limit, 50)), Math.max(0, offset)]
    );
    return result.rows.map(mapPageAgentConversation);
  },
  async touch(id: string): Promise<void> {
    await query(
      `
      UPDATE page_agent_conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  },
  async updateTitle(id: string, title: string): Promise<void> {
    await query(
      `
      UPDATE page_agent_conversations
      SET title = $1, updated_at = NOW()
      WHERE id = $2
      `,
      [title, id]
    );
  },
};

export const pageAgentMessageStore = {
  async create(input: {
    conversationId: string;
    userId: string;
    role: PageAgentMessageRole;
    messageType: PageAgentMessageType;
    content: string;
    sanitizedContent?: string;
    pageType?: string;
    route?: string;
    pageTitle?: string;
    contextPayload: Record<string, unknown>;
    sourcesPayload: unknown[];
    model?: string;
    tokensInput?: number;
    tokensOutput?: number;
    parentMessageId?: string;
    feedbackScore?: number;
    feedbackTag?: string;
  }): Promise<PageAgentMessage> {
    const result = await query<PageAgentMessageRow>(
      `
      INSERT INTO page_agent_messages (
        conversation_id,
        user_id,
        role,
        message_type,
        content,
        sanitized_content,
        page_type,
        route,
        page_title,
        context_payload,
        sources_payload,
        model,
        tokens_input,
        tokens_output,
        parent_message_id,
        feedback_score,
        feedback_tag
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17
      )
      RETURNING *
      `,
      [
        input.conversationId,
        input.userId,
        input.role,
        input.messageType,
        input.content,
        input.sanitizedContent ?? null,
        input.pageType ?? null,
        input.route ?? null,
        input.pageTitle ?? null,
        JSON.stringify(input.contextPayload),
        JSON.stringify(input.sourcesPayload),
        input.model ?? null,
        input.tokensInput ?? null,
        input.tokensOutput ?? null,
        input.parentMessageId ?? null,
        input.feedbackScore ?? null,
        input.feedbackTag ?? null,
      ]
    );
    return mapPageAgentMessage(result.rows[0]);
  },
  async getById(id: string): Promise<PageAgentMessage | undefined> {
    const result = await query<PageAgentMessageRow>(
      `
      SELECT *
      FROM page_agent_messages
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapPageAgentMessage(result.rows[0]);
  },
  async listRecentByConversation(
    conversationId: string,
    limit: number
  ): Promise<PageAgentMessage[]> {
    const result = await query<PageAgentMessageRow>(
      `
      SELECT *
      FROM page_agent_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [conversationId, Math.max(1, Math.min(limit, 100))]
    );
    return result.rows.reverse().map(mapPageAgentMessage);
  },
  async listRecentByUser(userId: string, limit: number): Promise<PageAgentMessage[]> {
    const result = await query<PageAgentMessageRow>(
      `
      SELECT *
      FROM page_agent_messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [userId, Math.max(1, Math.min(limit, 100))]
    );
    return result.rows.reverse().map(mapPageAgentMessage);
  },
  async listDistinctUserIdsForProfileAnalysis(limit: number): Promise<string[]> {
    const result = await query<{ user_id: string }>(
      `
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM page_agent_messages
        UNION
        SELECT user_id FROM subscriptions
      ) AS candidates
      ORDER BY user_id ASC
      LIMIT $1
      `,
      [Math.max(1, Math.min(limit, 200))]
    );
    return result.rows.map((item) => item.user_id);
  },
};

export const userProfileStore = {
  async getByUserId(userId: string): Promise<UserProfile | undefined> {
    const result = await query<UserProfileRow>(
      `
      SELECT *
      FROM user_profiles
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapUserProfile(result.rows[0]);
  },
  async upsertByUser(
    userId: string,
    input: {
      profileVersion: number;
      preferenceSummary: string;
      personaPrompt: string;
      interestTopics: string[];
      responsePreferences: Record<string, unknown>;
      evidenceStats: Record<string, unknown>;
      lastBehaviorSnapshot?: Record<string, unknown>;
    }
  ): Promise<UserProfile> {
    const result = await query<UserProfileRow>(
      `
      INSERT INTO user_profiles (
        user_id,
        profile_version,
        preference_summary,
        persona_prompt,
        interest_topics,
        response_preferences,
        evidence_stats,
        last_analyzed_at,
        last_behavior_snapshot,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), $8::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        profile_version = EXCLUDED.profile_version,
        preference_summary = EXCLUDED.preference_summary,
        persona_prompt = EXCLUDED.persona_prompt,
        interest_topics = EXCLUDED.interest_topics,
        response_preferences = EXCLUDED.response_preferences,
        evidence_stats = EXCLUDED.evidence_stats,
        last_analyzed_at = NOW(),
        last_behavior_snapshot = EXCLUDED.last_behavior_snapshot,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        input.profileVersion,
        input.preferenceSummary,
        input.personaPrompt.slice(0, 500),
        input.interestTopics,
        JSON.stringify(input.responsePreferences),
        JSON.stringify(input.evidenceStats),
        input.lastBehaviorSnapshot ? JSON.stringify(input.lastBehaviorSnapshot) : null,
      ]
    );
    return mapUserProfile(result.rows[0]);
  },
};

export const userProfileAnalysisJobStore = {
  async create(input: {
    triggerMode: UserProfileAnalysisTriggerMode;
    targetUserId?: string;
  }): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      INSERT INTO user_profile_analysis_jobs (
        trigger_mode,
        target_user_id,
        status
      )
      VALUES ($1, $2, 'pending')
      RETURNING *
      `,
      [input.triggerMode, input.targetUserId ?? null]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async getById(id: string): Promise<UserProfileAnalysisJob | undefined> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      SELECT *
      FROM user_profile_analysis_jobs
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async markRunning(id: string): Promise<void> {
    await query(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  },
  async updateCounters(
    id: string,
    input: { processedCount: number; successCount: number; failedCount: number }
  ): Promise<void> {
    await query(
      `
      UPDATE user_profile_analysis_jobs
      SET processed_count = $2,
          success_count = $3,
          failed_count = $4
      WHERE id = $1
      `,
      [id, input.processedCount, input.successCount, input.failedCount]
    );
  },
  async markSuccess(id: string): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'success', finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
  async markFailed(id: string, errorMessage: string): Promise<UserProfileAnalysisJob> {
    const result = await query<UserProfileAnalysisJobRow>(
      `
      UPDATE user_profile_analysis_jobs
      SET status = 'failed', error_message = $2, finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, errorMessage]
    );
    return mapUserProfileAnalysisJob(result.rows[0]);
  },
};

export const wecomConfigStore = {
  async getEnabledConfig(appCode?: string): Promise<WecomAppConfig | undefined> {
    const values: unknown[] = [];
    const conditions = ["enabled = TRUE"];
    if (appCode) {
      values.push(appCode);
      conditions.push(`app_code = $${values.length}`);
    }
    const result = await query<WecomAppConfigRow>(
      `
      SELECT
        id,
        app_code,
        corp_id,
        agent_id,
        secret,
        callback_token,
        callback_aes_key,
        internal_auth_token,
        base_url,
        enabled,
        created_at,
        updated_at
      FROM wecom_app_configs
      WHERE ${conditions.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      values
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapWecomAppConfig(result.rows[0]);
  },
};

export const wecomTagMappingStore = {
  async list(params?: {
    channelCode?: string;
    frequency?: "daily" | "weekly" | "instant";
    enabledOnly?: boolean;
  }): Promise<WecomTagMapping[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (params?.enabledOnly) {
      conditions.push("enabled = TRUE");
    }
    if (params?.channelCode) {
      values.push(params.channelCode);
      conditions.push(`channel_code = $${values.length}`);
    }
    if (params?.frequency) {
      values.push(params.frequency);
      conditions.push(`frequency = $${values.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query<WecomTagMappingRow>(
      `
      SELECT
        id,
        channel_code,
        frequency,
        tag_id,
        tag_name,
        enabled,
        last_sync_status,
        last_sync_error,
        last_synced_at,
        created_at,
        updated_at
      FROM wecom_tag_mappings
      ${whereClause}
      ORDER BY channel_code ASC, frequency ASC
      `
    );
    return result.rows.map(mapWecomTagMapping);
  },
  async listEnabled(): Promise<WecomTagMapping[]> {
    return this.list({ enabledOnly: true });
  },
  async getByChannelCodeAndFrequency(
    channelCode: string,
    frequency: "daily" | "weekly" | "instant"
  ): Promise<WecomTagMapping | undefined> {
    const result = await query<WecomTagMappingRow>(
      `
      SELECT
        id,
        channel_code,
        frequency,
        tag_id,
        tag_name,
        enabled,
        last_sync_status,
        last_sync_error,
        last_synced_at,
        created_at,
        updated_at
      FROM wecom_tag_mappings
      WHERE channel_code = $1
        AND frequency = $2
      LIMIT 1
      `,
      [channelCode, frequency]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapWecomTagMapping(result.rows[0]);
  },
  async upsert(input: {
    channelCode: string;
    frequency: "daily" | "weekly" | "instant";
    tagId: number;
    tagName: string;
    enabled?: boolean;
  }): Promise<WecomTagMapping> {
    const result = await query<WecomTagMappingRow>(
      `
      INSERT INTO wecom_tag_mappings (
        channel_code,
        frequency,
        tag_id,
        tag_name,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (channel_code, frequency)
      DO UPDATE SET
        tag_id = EXCLUDED.tag_id,
        tag_name = EXCLUDED.tag_name,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
      RETURNING
        id,
        channel_code,
        frequency,
        tag_id,
        tag_name,
        enabled,
        last_sync_status,
        last_sync_error,
        last_synced_at,
        created_at,
        updated_at
      `,
      [
        input.channelCode,
        input.frequency,
        input.tagId,
        input.tagName,
        input.enabled ?? true,
      ]
    );
    return mapWecomTagMapping(result.rows[0]);
  },
  async markSyncResult(
    id: string,
    input: {
      status: TagSyncStatus;
      errorMessage?: string;
      syncedAt?: string;
    }
  ): Promise<void> {
    await query(
      `
      UPDATE wecom_tag_mappings
      SET
        last_sync_status = $2,
        last_sync_error = $3,
        last_synced_at = $4,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, input.status, input.errorMessage ?? null, input.syncedAt ?? null]
    );
  },
};

export const pushRecordStore = {
  async create(input: {
    articleId?: string;
    channelCode: string;
    subscriptionUserId?: string;
    qywxUserId: string;
    deliveryMode?: PushDeliveryMode;
    wecomTagId?: number;
    wecomTagName?: string;
    messageType: string;
    title: string;
    summary: string;
    url: string;
    requestPayload: Record<string, unknown>;
  }): Promise<PushRecord> {
    const result = await query<PushRecordRow>(
      `
      INSERT INTO push_records (
        article_id,
        channel_code,
        subscription_user_id,
        qywx_user_id,
        delivery_mode,
        wecom_tag_id,
        wecom_tag_name,
        message_type,
        title,
        summary,
        url,
        request_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      RETURNING
        id,
        article_id,
        channel_code,
        subscription_user_id,
        qywx_user_id,
        delivery_mode,
        wecom_tag_id,
        wecom_tag_name,
        message_type,
        title,
        summary,
        url,
        status,
        retry_count,
        wecom_errcode,
        wecom_errmsg,
        wecom_msgid,
        response_code,
        request_payload,
        response_payload,
        error_detail,
        sent_at,
        created_at,
        updated_at
      `,
      [
        input.articleId ?? null,
        input.channelCode,
        input.subscriptionUserId ?? null,
        input.qywxUserId,
        input.deliveryMode ?? "user",
        input.wecomTagId ?? null,
        input.wecomTagName ?? null,
        input.messageType,
        input.title,
        input.summary,
        input.url,
        JSON.stringify(input.requestPayload),
      ]
    );
    return mapPushRecord(result.rows[0]);
  },
  async markSuccess(
    id: string,
    input: {
      retryCount: number;
      wecomErrcode: number;
      wecomErrmsg: string;
      wecomMsgid?: string;
      responseCode?: string;
      responsePayload: Record<string, unknown>;
    }
  ): Promise<void> {
    await query(
      `
      UPDATE push_records
      SET
        status = 'success',
        retry_count = $2,
        wecom_errcode = $3,
        wecom_errmsg = $4,
        wecom_msgid = $5,
        response_code = $6,
        response_payload = $7::jsonb,
        error_detail = NULL,
        sent_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        id,
        input.retryCount,
        input.wecomErrcode,
        input.wecomErrmsg,
        input.wecomMsgid ?? null,
        input.responseCode ?? null,
        JSON.stringify(input.responsePayload),
      ]
    );
  },
  async markFailed(
    id: string,
    input: {
      retryCount: number;
      wecomErrcode?: number;
      wecomErrmsg?: string;
      errorDetail: string;
      responsePayload?: Record<string, unknown>;
    }
  ): Promise<void> {
    await query(
      `
      UPDATE push_records
      SET
        status = 'failed',
        retry_count = $2,
        wecom_errcode = $3,
        wecom_errmsg = $4,
        response_payload = $5::jsonb,
        error_detail = $6,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        id,
        input.retryCount,
        input.wecomErrcode ?? null,
        input.wecomErrmsg ?? null,
        JSON.stringify(input.responsePayload ?? {}),
        input.errorDetail,
      ]
    );
  },
  async listByArticleId(articleId: string): Promise<PushRecord[]> {
    const result = await query<PushRecordRow>(
      `
      SELECT
        id, article_id, channel_code, subscription_user_id, qywx_user_id,
        delivery_mode, wecom_tag_id, wecom_tag_name, message_type,
        title, summary, url, status, retry_count, wecom_errcode,
        wecom_errmsg, wecom_msgid, response_code, request_payload,
        response_payload, error_detail, sent_at, created_at, updated_at
      FROM push_records
      WHERE article_id = $1
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [articleId]
    );
    return result.rows.map(mapPushRecord);
  },
  async listRecent(limit = 20): Promise<PushRecord[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await query<PushRecordRow>(
      `
      SELECT
        id,
        article_id,
        channel_code,
        subscription_user_id,
        qywx_user_id,
        delivery_mode,
        wecom_tag_id,
        wecom_tag_name,
        message_type,
        title,
        summary,
        url,
        status,
        retry_count,
        wecom_errcode,
        wecom_errmsg,
        wecom_msgid,
        response_code,
        request_payload,
        response_payload,
        error_detail,
        sent_at,
        created_at,
        updated_at
      FROM push_records
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows.map(mapPushRecord);
  },
  async listTodayArticlesByUserIds(userIds: string[]): Promise<TodayPushedArticle[]> {
    const normalizedUserIds = [...new Set(userIds.map((item) => item.trim()).filter(Boolean))];
    if (normalizedUserIds.length === 0) {
      return [];
    }
    const result = await query<TodayPushedArticleRow>(
      `
      WITH today_records AS (
        SELECT
          id,
          article_id,
          request_payload,
          sent_at
        FROM push_records
        WHERE (
            subscription_user_id = ANY($1::text[])
            OR qywx_user_id = ANY($1::text[])
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(request_payload -> 'userIds') = 'array'
                    THEN request_payload -> 'userIds'
                  ELSE '[]'::jsonb
                END
              ) AS user_id_item(value)
              WHERE user_id_item.value = ANY($1::text[])
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(request_payload -> 'touser') = 'array'
                    THEN request_payload -> 'touser'
                  ELSE '[]'::jsonb
                END
              ) AS touser_item(value)
              WHERE touser_item.value = ANY($1::text[])
            )
            OR COALESCE(request_payload ->> 'touser', '') = ANY($1::text[])
          )
          AND status = 'success'
          AND sent_at IS NOT NULL
          AND (sent_at AT TIME ZONE 'Asia/Shanghai')::date =
              (NOW() AT TIME ZONE 'Asia/Shanghai')::date
      ),
      record_articles AS (
        SELECT
          id AS push_record_id,
          sent_at,
          article_id::text AS resolved_article_id
        FROM today_records
        WHERE article_id IS NOT NULL
        UNION ALL
        SELECT
          today_records.id AS push_record_id,
          today_records.sent_at,
          article_ids.value AS resolved_article_id
        FROM today_records
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(today_records.request_payload -> 'articleIds') = 'array'
              THEN today_records.request_payload -> 'articleIds'
            ELSE '[]'::jsonb
          END
        ) AS article_ids(value)
      ),
      deduplicated_articles AS (
        SELECT DISTINCT ON (record_articles.resolved_article_id)
          record_articles.push_record_id,
          record_articles.sent_at,
          record_articles.resolved_article_id
        FROM record_articles
        ORDER BY record_articles.resolved_article_id, record_articles.sent_at DESC
      )
      SELECT
        deduplicated_articles.push_record_id,
        deduplicated_articles.sent_at,
        articles.id,
        articles.created_by_user_id,
        articles.title,
        articles.summary,
        articles.content,
        articles.channel_code,
        channels.name AS channel_name,
        articles.category,
        articles.tags,
        articles.status,
        articles.author,
        articles.published_at,
        articles.created_at,
        articles.updated_at
      FROM deduplicated_articles
      INNER JOIN articles ON articles.id::text = deduplicated_articles.resolved_article_id
      LEFT JOIN article_channels channels ON channels.code = articles.channel_code
      ORDER BY deduplicated_articles.sent_at DESC, articles.published_at DESC NULLS LAST
      `,
      [normalizedUserIds]
    );
    return result.rows.map((row: TodayPushedArticleRow) => ({
      pushRecordId: row.push_record_id,
      sentAt: row.sent_at,
      article: mapArticle(row),
    }));
  },
};

interface PushDeliveryRow {
  id: string;
  push_record_id: string;
  article_id: string;
  user_id: string;
  status: 'sent' | 'invalid';
  created_at: string;
}

export const pushDeliveryStore = {
  async insertBatch(records: Array<{
    pushRecordId: string;
    articleId: string;
    userId: string;
    status: 'sent' | 'invalid';
  }>): Promise<void> {
    if (records.length === 0) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    records.forEach((r, i) => {
      const base = i * 4;
      values.push(r.pushRecordId, r.articleId, r.userId, r.status);
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    });
    await query(
      `INSERT INTO push_deliveries (push_record_id, article_id, user_id, status)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  },

  async listUserIdsByArticle(articleId: string): Promise<string[]> {
    const result = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM push_deliveries WHERE article_id = $1`,
      [articleId]
    );
    return result.rows.map(r => r.user_id);
  },
};

export const feedbackStore = {
  async create(input: {
    userId: string;
    type: "bug" | "ux" | "content" | "other";
    content: string;
    contact?: string;
    pageRoute: string;
    pageTitle: string;
    source: string;
  }): Promise<FeedbackEntry> {
    const result = await query<FeedbackEntryRow>(
      `
      INSERT INTO feedback_entries (
        user_id,
        type,
        content,
        contact,
        page_route,
        page_title,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        input.userId,
        input.type,
        input.content,
        input.contact ?? null,
        input.pageRoute,
        input.pageTitle,
        input.source,
      ]
    );
    return mapFeedbackEntry(result.rows[0]);
  },
  async list(filters: FeedbackListFilters): Promise<FeedbackListResult> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.type) {
      values.push(filters.type);
      conditions.push(`type = $${values.length}`);
    }
    if (filters.startAt) {
      values.push(filters.startAt);
      conditions.push(`created_at >= $${values.length}::timestamptz`);
    }
    if (filters.endAt) {
      values.push(filters.endAt);
      conditions.push(`created_at <= $${values.length}::timestamptz`);
    }
    if (filters.status) {
      const statuses = filters.status.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        values.push(statuses);
        conditions.push(`status = ANY($${values.length}::text[])`);
      }
    }
    if (filters.userId) {
      values.push(filters.userId);
      conditions.push(`user_id = $${values.length}`);
    }
    if (filters.search) {
      values.push(`%${filters.search}%`);
      const p = values.length;
      conditions.push(`(content ILIKE $${p} OR page_title ILIKE $${p} OR page_route ILIKE $${p})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (filters.page - 1) * filters.pageSize;

    values.push(filters.pageSize);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    if (filters.includeEval) {
      const itemsResult = await query<FeedbackEntryWithEvalRow>(
        `
        SELECT
          fe.id, fe.user_id, u.xm AS user_display_name, fe.type, fe.content, fe.contact,
          fe.page_route, fe.page_title, fe.source, fe.status,
          fe.admin_note, fe.created_at,
          ev.eval_type, ev.severity, ev.fix_scope, ev.alignment,
          ev.suggested_action, ev.suggestion, ev.detailed_analysis, ev.evaluated_at
        FROM feedback_entries fe
        LEFT JOIN users u ON fe.user_id = u.xh
        LEFT JOIN LATERAL (
          SELECT *
          FROM feedback_evaluations
          WHERE feedback_id = fe.id
          ORDER BY evaluated_at DESC
          LIMIT 1
        ) ev ON true
        ${whereClause}
        ORDER BY fe.created_at DESC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
        `,
        values
      );

      const countResult = await query<{ total: string }>(
        `
        SELECT COUNT(*)::text AS total
        FROM feedback_entries
        ${whereClause}
        `,
        values.slice(0, values.length - 2)
      );

      return {
        items: itemsResult.rows.map(mapFeedbackEntry),
        total: Number(countResult.rows[0]?.total ?? 0),
      };
    }

    const itemsResult = await query<FeedbackEntryRow>(
      `
      SELECT
        fe.id,
        fe.user_id,
        u.xm AS user_display_name,
        fe.type,
        fe.content,
        fe.contact,
        fe.page_route,
        fe.page_title,
        fe.source,
        fe.status,
        fe.admin_note,
        fe.created_at
      FROM feedback_entries fe
      LEFT JOIN users u ON fe.user_id = u.xh
      ${whereClause}
      ORDER BY fe.created_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `,
      values
    );

    const countResult = await query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM feedback_entries
      ${whereClause}
      `,
      values.slice(0, values.length - 2)
    );

    return {
      items: itemsResult.rows.map(mapFeedbackEntry),
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  },
  async update(
    id: string,
    input: { status?: FeedbackStatus; adminNote?: string }
  ): Promise<FeedbackEntry | null> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.status) {
      values.push(input.status);
      sets.push(`status = $${values.length}`);
    }
    if (input.adminNote !== undefined) {
      values.push(input.adminNote);
      sets.push(`admin_note = $${values.length}`);
    }
    if (sets.length === 0) return null;

    values.push(id);
    const result = await query<FeedbackEntryRow>(
      `UPDATE feedback_entries SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return null;
    return mapFeedbackEntry(result.rows[0]);
  },
};


export const feedbackLikeStore = {
  async listPublic(params: {
    page: number;
    pageSize: number;
    sort: "recent" | "popular";
    currentUserId?: string;
  }): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const conditions = [
      `fe.status = ANY($1::text[])`,
    ];
    const values: unknown[] = [
      ["approved", "verified", "deployed", "wontfix", "reverted"],
    ];
    const orderClause = params.sort === "popular"
      ? "ORDER BY like_count DESC, fe.created_at DESC"
      : "ORDER BY fe.created_at DESC";
    const offset = (params.page - 1) * params.pageSize;

    values.push(params.pageSize);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const itemsResult = await query<Record<string, unknown>>(
      `SELECT fe.id, fe.user_id, fe.type, fe.content, fe.page_route, fe.page_title, fe.status, fe.admin_note, fe.created_at,
              COUNT(fl.id) AS like_count
       FROM feedback_entries fe
       LEFT JOIN feedback_likes fl ON fl.feedback_id = fe.id
       WHERE fe.status = ANY($1::text[])
       GROUP BY fe.id
       ${orderClause}
       LIMIT ${limitPlaceholder}
       OFFSET ${offsetPlaceholder}`,
      values
    );

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM feedback_entries fe WHERE fe.status = ANY($1::text[])`,
      [["approved", "verified", "deployed", "wontfix", "reverted"]]
    );

    const items = itemsResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      content: row.content,
      pageRoute: row.page_route,
      pageTitle: row.page_title,
      status: row.status,
      adminNote: row.admin_note ?? undefined,
      createdAt: row.created_at,
      
      likeCount: Number(row.like_count ?? 0),
      likedByMe: false,
    }));

    if (params.currentUserId && items.length > 0) {
      const feedbackIds = items.map((i: Record<string, unknown>) => i.id);
      const likesResult = await query<{ feedback_id: string }>(
        `SELECT feedback_id FROM feedback_likes WHERE feedback_id = ANY($1::uuid[]) AND user_id = $2`,
        [feedbackIds, params.currentUserId]
      );
      const likedSet = new Set(likesResult.rows.map((r: { feedback_id: string }) => r.feedback_id));
      for (const item of items) {
        (item as Record<string, unknown>).likedByMe = likedSet.has(item.id as string);
      }
    }

    return { items: items as Array<Record<string, unknown>>, total: Number(countResult.rows[0]?.total ?? 0) };
  },

  async like(feedbackId: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO feedback_likes (feedback_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [feedbackId, userId]
    );
  },

  async unlike(feedbackId: string, userId: string): Promise<void> {
    await query(
      `DELETE FROM feedback_likes WHERE feedback_id = $1 AND user_id = $2`,
      [feedbackId, userId]
    );
  },

  async getLikeCount(feedbackId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM feedback_likes WHERE feedback_id = $1`,
      [feedbackId]
    );
    return Number(result.rows[0]?.count ?? 0);
  },
};

export const analyticsEventStore = {
  async create(input: {
    eventType: AnalyticsEvent["eventType"];
    eventName: AnalyticsEvent["eventName"];
    userId?: string;
    sessionId?: string;
    pageRoute?: string;
    pageTitle?: string;
    articleId?: string;
    channelCode?: string;
    sourceModule: string;
    eventPayload?: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<AnalyticsEvent> {
    const result = await query<AnalyticsEventRow>(
      `
      INSERT INTO analytics_events (
        event_type,
        event_name,
        user_id,
        session_id,
        page_route,
        page_title,
        article_id,
        channel_code,
        source_module,
        event_payload,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      RETURNING
        id,
        event_type,
        event_name,
        user_id,
        session_id,
        page_route,
        page_title,
        article_id,
        channel_code,
        source_module,
        event_payload,
        occurred_at,
        created_at
      `,
      [
        input.eventType,
        input.eventName,
        input.userId ?? null,
        input.sessionId ?? null,
        input.pageRoute ?? null,
        input.pageTitle ?? null,
        input.articleId ?? null,
        input.channelCode ?? null,
        input.sourceModule,
        JSON.stringify(input.eventPayload ?? {}),
        input.occurredAt ?? new Date().toISOString(),
      ]
    );
    return mapAnalyticsEvent(result.rows[0]);
  },
  async countByEventName(input: {
    eventName: AnalyticsEvent["eventName"];
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<number> {
    const values: unknown[] = [input.eventName];
    const conditions = ["event_name = $1"];
    if (input.startAt) {
      values.push(input.startAt);
      conditions.push(`occurred_at >= $${values.length}::timestamptz`);
    }
    if (input.endAt) {
      values.push(input.endAt);
      conditions.push(`occurred_at <= $${values.length}::timestamptz`);
    }
    if (input.channelCode) {
      values.push(input.channelCode);
      conditions.push(`channel_code = $${values.length}`);
    }
    const result = await query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );
    return Number(result.rows[0]?.total ?? 0);
  },
  async countDistinctUsers(input: {
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<number> {
    const values: unknown[] = [];
    const conditions = ["user_id IS NOT NULL"];
    if (input.startAt) {
      values.push(input.startAt);
      conditions.push(`occurred_at >= $${values.length}::timestamptz`);
    }
    if (input.endAt) {
      values.push(input.endAt);
      conditions.push(`occurred_at <= $${values.length}::timestamptz`);
    }
    if (input.channelCode) {
      values.push(input.channelCode);
      conditions.push(`channel_code = $${values.length}`);
    }
    const result = await query<{ total: string }>(
      `
      SELECT COUNT(DISTINCT user_id)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );
    return Number(result.rows[0]?.total ?? 0);
  },
  async listDailyTrend(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ date: string; pv: number; uv: number; articleViews: number }>> {
    const result = await query<{
      date: string;
      pv: string;
      uv: string;
      article_views: string;
    }>(
      `
      SELECT
        to_char(date_trunc('day', occurred_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE event_name = 'page_view')::text AS pv,
        COUNT(DISTINCT user_id) FILTER (
          WHERE event_name = 'page_view' AND user_id IS NOT NULL
        )::text AS uv,
        COUNT(*) FILTER (WHERE event_name = 'article_view')::text AS article_views
      FROM analytics_events
      WHERE occurred_at >= $1::timestamptz
        AND occurred_at <= $2::timestamptz
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      date: row.date,
      pv: Number(row.pv),
      uv: Number(row.uv),
      articleViews: Number(row.article_views),
    }));
  },
  async listChannelMetricGroups(input: {
    eventName: AnalyticsEvent["eventName"];
    startAt: string;
    endAt: string;
  }): Promise<Array<{ key: string; label: string; value: number }>> {
    const result = await query<{
      key: string;
      label: string;
      value: string;
    }>(
      `
      SELECT
        analytics.channel_code AS key,
        COALESCE(channels.name, analytics.channel_code) AS label,
        COUNT(*)::text AS value
      FROM analytics_events analytics
      LEFT JOIN article_channels channels
        ON channels.code = analytics.channel_code
      WHERE analytics.event_name = $1
        AND analytics.channel_code IS NOT NULL
        AND analytics.occurred_at >= $2::timestamptz
        AND analytics.occurred_at <= $3::timestamptz
      GROUP BY analytics.channel_code, channels.name
      ORDER BY COUNT(*) DESC, analytics.channel_code ASC
      `,
      [input.eventName, input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      value: Number(row.value),
    }));
  },
  async listFeedbackTypeMetrics(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ key: string; label: string; value: number }>> {
    const result = await query<{
      key: string;
      value: string;
    }>(
      `
      SELECT
        COALESCE(event_payload->>'type', 'unknown') AS key,
        COUNT(*)::text AS value
      FROM analytics_events
      WHERE event_name = 'feedback_created'
        AND occurred_at >= $1::timestamptz
        AND occurred_at <= $2::timestamptz
      GROUP BY COALESCE(event_payload->>'type', 'unknown')
      ORDER BY COUNT(*) DESC, key ASC
      `,
      [input.startAt, input.endAt]
    );
    return result.rows.map((row) => ({
      key: row.key,
      label: row.key,
      value: Number(row.value),
    }));
  },
  async listTopArticles(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<
    Array<{
      articleId: string;
      title: string;
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>
  > {
    const result = await query<{
      article_id: string;
      title: string;
      channel_code: string;
      channel_name: string | null;
      view_count: string;
    }>(
      `
      SELECT
        analytics.article_id,
        articles.title,
        articles.channel_code,
        COALESCE(channels.name, articles.channel_code) AS channel_name,
        COUNT(*)::text AS view_count
      FROM analytics_events analytics
      INNER JOIN articles
        ON articles.id = analytics.article_id
      LEFT JOIN article_channels channels
        ON channels.code = articles.channel_code
      WHERE analytics.event_name = 'article_view'
        AND analytics.article_id IS NOT NULL
        AND analytics.occurred_at >= $1::timestamptz
        AND analytics.occurred_at <= $2::timestamptz
      GROUP BY analytics.article_id, articles.title, articles.channel_code, channels.name
      ORDER BY COUNT(*) DESC, articles.title ASC
      LIMIT $3
      `,
      [input.startAt, input.endAt, input.limit]
    );
    return result.rows.map((row) => ({
      articleId: row.article_id,
      title: row.title,
      channelCode: row.channel_code,
      channelName: row.channel_name ?? row.channel_code,
      viewCount: Number(row.view_count),
    }));
  },
  async listTopChannels(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<Array<{ channelCode: string; channelName: string; viewCount: number }>> {
    const result = await query<{
      channel_code: string;
      channel_name: string | null;
      view_count: string;
    }>(
      `
      SELECT
        analytics.channel_code,
        COALESCE(channels.name, analytics.channel_code) AS channel_name,
        COUNT(*)::text AS view_count
      FROM analytics_events analytics
      LEFT JOIN article_channels channels
        ON channels.code = analytics.channel_code
      WHERE analytics.event_name = 'article_view'
        AND analytics.channel_code IS NOT NULL
        AND analytics.occurred_at >= $1::timestamptz
        AND analytics.occurred_at <= $2::timestamptz
      GROUP BY analytics.channel_code, channels.name
      ORDER BY COUNT(*) DESC, analytics.channel_code ASC
      LIMIT $3
      `,
      [input.startAt, input.endAt, input.limit]
    );
    return result.rows.map((row) => ({
      channelCode: row.channel_code,
      channelName: row.channel_name ?? row.channel_code,
      viewCount: Number(row.view_count),
    }));
  },
  async getStatus(): Promise<{
    latestEventAt?: string;
    totalEvents: number;
    todayEventCount: number;
  }> {
    const result = await query<{
      latest_event_at: string | null;
      total_events: string;
      today_event_count: string;
    }>(
      `
      WITH today_start AS (
        SELECT date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' AS value
      )
      SELECT
        MAX(occurred_at) AS latest_event_at,
        COUNT(*)::text AS total_events,
        COUNT(*) FILTER (
          WHERE occurred_at >= (SELECT value FROM today_start)
        )::text AS today_event_count
      FROM analytics_events
      `
    );
    return {
      latestEventAt: result.rows[0]?.latest_event_at ?? undefined,
      totalEvents: Number(result.rows[0]?.total_events ?? 0),
      todayEventCount: Number(result.rows[0]?.today_event_count ?? 0),
    };
  },
};

interface UserAnnotationRow {
  id: string;
  user_id: string;
  article_id: string;
  selected_text: string;
  note: string | null;
  color: string;
  start_offset: number;
  end_offset: number;
  created_at: string;
  updated_at: string;
}

const mapUserAnnotation = (row: UserAnnotationRow): UserAnnotation => ({
  id: row.id,
  userId: row.user_id,
  articleId: row.article_id,
  selectedText: row.selected_text,
  note: row.note ?? undefined,
  color: row.color,
  startOffset: row.start_offset,
  endOffset: row.end_offset,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const annotationStore = {
  async listByArticle(userId: string, articleId: string): Promise<UserAnnotation[]> {
    const result = await query<UserAnnotationRow>(
      `SELECT * FROM user_annotations WHERE user_id = $1 AND article_id = $2 ORDER BY start_offset ASC`,
      [userId, articleId]
    );
    return result.rows.map(mapUserAnnotation);
  },
  async create(input: {
    userId: string;
    articleId: string;
    selectedText: string;
    note?: string;
    color?: string;
    startOffset: number;
    endOffset: number;
  }): Promise<UserAnnotation> {
    const result = await query<UserAnnotationRow>(
      `INSERT INTO user_annotations (user_id, article_id, selected_text, note, color, start_offset, end_offset)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.userId, input.articleId, input.selectedText, input.note ?? null, input.color ?? "yellow", input.startOffset, input.endOffset]
    );
    return mapUserAnnotation(result.rows[0]);
  },
  async update(id: string, userId: string, input: { note?: string; color?: string }): Promise<UserAnnotation | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [id, userId];
    if (input.note !== undefined) {
      values.push(input.note);
      sets.push(`note = $${values.length}`);
    }
    if (input.color !== undefined) {
      values.push(input.color);
      sets.push(`color = $${values.length}`);
    }
    if (sets.length === 0) return undefined;
    sets.push(`updated_at = NOW()`);
    const result = await query<UserAnnotationRow>(
      `UPDATE user_annotations SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values
    );
    if (result.rows.length === 0) return undefined;
    return mapUserAnnotation(result.rows[0]);
  },
  async remove(id: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM user_annotations WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },
};

// ── users (Oracle 同步的师生基础信息) ──

export interface UserRow {
  xh: string;
  user_type: "bks" | "yjs" | "jzg";
  xm: string;
  xymc?: string;
  zymc?: string;
  nj?: string;
  xslx?: string;
}

export const userStore = {
  async getByXh(xh: string): Promise<UserRow | undefined> {
    const result = await query<UserRow>(
      `SELECT xh, user_type, xm, xymc, zymc, nj, xslx
       FROM users WHERE xh = $1 LIMIT 1`,
      [xh]
    );
    return result.rows[0];
  },
};

export const recordAnalyticsEventSafely = async (input: {
  eventType: AnalyticsEvent["eventType"];
  eventName: AnalyticsEvent["eventName"];
  userId?: string;
  sessionId?: string;
  pageRoute?: string;
  pageTitle?: string;
  articleId?: string;
  channelCode?: string;
  sourceModule: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> => {
  try {
    await analyticsEventStore.create(input);
  } catch (error) {
    logger.error("analytics.event.write.failed", {
      eventType: input.eventType,
      eventName: input.eventName,
      sourceModule: input.sourceModule,
      userId: input.userId,
      articleId: input.articleId,
      channelCode: input.channelCode,
      error,
    });
  }
};

// Survey stores

interface SurveyRow {
  id: string;
  creator_user_id: string;
  title: string;
  description: string;
  questions: Record<string, unknown>[];
  status: SurveyStatus;
  publish_token: string | null;
  recipient_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const mapSurvey = (row: SurveyRow): Survey => ({
  id: row.id,
  creatorUserId: row.creator_user_id,
  title: row.title,
  description: row.description,
  questions: row.questions as unknown as Survey["questions"],
  status: row.status,
  publishToken: row.publish_token ?? undefined,
  recipientConfig: row.recipient_config as unknown as Survey["recipientConfig"],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

interface SurveyResponseRow {
  id: string;
  survey_id: string;
  respondent_user_id: string | null;
  answers: Record<string, unknown>;
  created_at: string;
}

const mapSurveyResponse = (row: SurveyResponseRow): SurveyResponse => ({
  id: row.id,
  surveyId: row.survey_id,
  respondentUserId: row.respondent_user_id ?? undefined,
  answers: row.answers,
  createdAt: row.created_at,
});

export const surveyStore = {
  async create(input: {
    creatorUserId: string;
    title: string;
    description: string;
    questions: Survey["questions"];
    status?: SurveyStatus;
  }): Promise<Survey> {
    const result = await query<SurveyRow>(
      `INSERT INTO surveys (creator_user_id, title, description, questions, status)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [
        input.creatorUserId,
        input.title,
        input.description,
        JSON.stringify(input.questions),
        input.status ?? "draft",
      ]
    );
    return mapSurvey(result.rows[0]!);
  },

  async getById(id: string): Promise<Survey | undefined> {
    const result = await query<SurveyRow>(
      `SELECT * FROM surveys WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapSurvey(result.rows[0]) : undefined;
  },

  async getByPublishToken(token: string): Promise<Survey | undefined> {
    const result = await query<SurveyRow>(
      `SELECT * FROM surveys WHERE publish_token = $1 LIMIT 1`,
      [token]
    );
    return result.rows[0] ? mapSurvey(result.rows[0]) : undefined;
  },

  async listByCreator(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<Survey[]> {
    const result = await query<SurveyRow>(
      `SELECT * FROM surveys
       WHERE creator_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows.map(mapSurvey);
  },

  async countByCreator(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM surveys WHERE creator_user_id = $1`,
      [userId]
    );
    return Number(result.rows[0]?.count ?? 0);
  },

  async update(
    id: string,
    input: {
      title?: string;
      description?: string;
      questions?: Survey["questions"];
      status?: SurveyStatus;
      publishToken?: string;
      recipientConfig?: Survey["recipientConfig"];
    }
  ): Promise<Survey | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.questions !== undefined) {
      sets.push(`questions = $${idx++}::jsonb`);
      values.push(JSON.stringify(input.questions));
    }
    if (input.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(input.status);
    }
    if (input.publishToken !== undefined) {
      sets.push(`publish_token = $${idx++}`);
      values.push(input.publishToken);
    }
    if (input.recipientConfig !== undefined) {
      sets.push(`recipient_config = $${idx++}::jsonb`);
      values.push(JSON.stringify(input.recipientConfig));
    }

    if (sets.length === 0) return surveyStore.getById(id);

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query<SurveyRow>(
      `UPDATE surveys SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? mapSurvey(result.rows[0]) : undefined;
  },
};

export const surveyResponseStore = {
  async create(input: {
    surveyId: string;
    respondentUserId?: string;
    answers: Record<string, unknown>;
  }): Promise<SurveyResponse> {
    const result = await query<SurveyResponseRow>(
      `INSERT INTO survey_responses (survey_id, respondent_user_id, answers)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *`,
      [
        input.surveyId,
        input.respondentUserId ?? null,
        JSON.stringify(input.answers),
      ]
    );
    return mapSurveyResponse(result.rows[0]!);
  },

  async listBySurvey(
    surveyId: string,
    limit = 200,
    offset = 0
  ): Promise<SurveyResponse[]> {
    const result = await query<SurveyResponseRow>(
      `SELECT * FROM survey_responses
       WHERE survey_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [surveyId, limit, offset]
    );
    return result.rows.map(mapSurveyResponse);
  },

  async countBySurvey(surveyId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = $1`,
      [surveyId]
    );
    return Number(result.rows[0]?.count ?? 0);
  },
};
