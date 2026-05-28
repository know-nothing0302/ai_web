"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAnalyticsEventSafely = exports.analyticsEventStore = exports.feedbackLikeStore = exports.feedbackStore = exports.pushRecordStore = exports.wecomTagMappingStore = exports.wecomConfigStore = exports.userProfileAnalysisJobStore = exports.userProfileStore = exports.pageAgentMessageStore = exports.pageAgentConversationStore = exports.subscriptionStore = exports.articleStore = exports.articleChannelStore = void 0;
const db_1 = require("./db");
const logger_1 = require("./logger");
const mapArticle = (row) => ({
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
});
const mapSubscription = (row) => ({
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
const mapArticleChannel = (row) => ({
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const mapWecomAppConfig = (row) => ({
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
const mapFeedbackEntry = (row) => {
    const base = {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        content: row.content,
        contact: row.contact ?? undefined,
        pageRoute: row.page_route,
        pageTitle: row.page_title,
        source: row.source,
        status: row.status,
        adminNote: row.admin_note ?? undefined,
        createdAt: row.created_at,
    };
    const evalRow = row;
    if (evalRow.eval_type) {
        return {
            ...base,
            evaluation: {
                evalType: evalRow.eval_type,
                severity: evalRow.severity,
                fixScope: evalRow.fix_scope,
                alignment: evalRow.alignment,
                suggestedAction: evalRow.suggested_action,
                suggestion: evalRow.suggestion,
                evaluatedAt: evalRow.evaluated_at,
            },
        };
    }
    return base;
};
const mapAnalyticsEvent = (row) => ({
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
const mapWecomTagMapping = (row) => ({
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
const mapPushRecord = (row) => ({
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
const mapPageAgentConversation = (row) => ({
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
const mapPageAgentMessage = (row) => ({
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
const mapUserProfile = (row) => ({
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
const mapUserProfileAnalysisJob = (row) => ({
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
exports.articleChannelStore = {
    async list(enabledOnly = false) {
        const result = await (0, db_1.query)(`
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
      `);
        return result.rows.map(mapArticleChannel);
    },
    async getByCode(code) {
        const result = await (0, db_1.query)(`
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
      `, [code]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapArticleChannel(result.rows[0]);
    },
};
exports.articleStore = {
    async list(params) {
        const values = [];
        const conditions = [];
        const discoverConditions = [];
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
            discoverConditions.push(`(articles.title ILIKE $${values.length} OR articles.summary ILIKE $${values.length} OR articles.content ILIKE $${values.length})`);
        }
        if (discoverConditions.length > 0) {
            conditions.push(`(${discoverConditions.join(" OR ")})`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await (0, db_1.query)(`
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
      `, values);
        return result.rows.map(mapArticle);
    },
    async getById(id) {
        const result = await (0, db_1.query)(`
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
      WHERE articles.id = $1
      LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapArticle(result.rows[0]);
    },
    async listPublishedWithin(input) {
        const result = await (0, db_1.query)(`
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
      `, [input.startAt, input.endAt]);
        return result.rows.map(mapArticle);
    },
    async create(input) {
        const result = await (0, db_1.query)(`
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
      `, [
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
        ]);
        return mapArticle(result.rows[0]);
    },
    async update(id, input) {
        const values = [];
        const updates = [];
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
        const result = await (0, db_1.query)(`
      UPDATE articles
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id
      `, values);
        if (result.rows.length === 0) {
            return undefined;
        }
        return this.getById(id);
    },
    async remove(id) {
        const result = await (0, db_1.query)(`
      DELETE FROM articles
      WHERE id = $1
      RETURNING id
      `, [id]);
        return result.rows.length > 0;
    },
};
exports.subscriptionStore = {
    async listByUser(userId) {
        const result = await (0, db_1.query)(`
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
      `, [userId]);
        return result.rows.map(mapSubscription);
    },
    async upsertByUser(userId, input) {
        const result = await (0, db_1.query)(`
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
      ON CONFLICT (user_id, frequency)
      DO UPDATE SET
        channel_codes = EXCLUDED.channel_codes,
        categories = EXCLUDED.categories,
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
      `, [
            userId,
            input.channelCodes,
            input.categories,
            input.frequency,
            input.qywxUserId,
            input.qywxUserName ?? null,
            input.enabled,
        ]);
        return mapSubscription(result.rows[0]);
    },
    async listEnabledByChannelCode(channelCode) {
        const result = await (0, db_1.query)(`
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
      `, [channelCode]);
        return result.rows.map(mapSubscription);
    },
    async listEnabledByFrequency(frequency) {
        const result = await (0, db_1.query)(`
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
      `, [frequency]);
        return result.rows.map(mapSubscription);
    },
    async listEnabledByChannelCodeAndFrequency(channelCode, frequency) {
        const result = await (0, db_1.query)(`
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
      `, [channelCode, frequency]);
        return result.rows.map(mapSubscription);
    },
    async getEnabledByChannelCodeAndUserId(channelCode, userId, frequency) {
        const values = [channelCode, userId];
        const conditions = [
            "enabled = TRUE",
            "$1 = ANY(channel_codes)",
            "user_id = $2",
        ];
        if (frequency) {
            values.push(frequency);
            conditions.push(`frequency = $${values.length}`);
        }
        const result = await (0, db_1.query)(`
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
      `, values);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapSubscription(result.rows[0]);
    },
};
exports.pageAgentConversationStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
      INSERT INTO page_agent_conversations (
        user_id,
        page_type,
        route,
        page_title,
        title
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `, [
            input.userId,
            input.pageType ?? null,
            input.route ?? null,
            input.pageTitle ?? null,
            input.title ?? null,
        ]);
        return mapPageAgentConversation(result.rows[0]);
    },
    async getById(id) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM page_agent_conversations
      WHERE id = $1
      LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapPageAgentConversation(result.rows[0]);
    },
    async listByUser(userId, limit) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM page_agent_conversations
      WHERE user_id = $1
      ORDER BY last_message_at DESC
      LIMIT $2
      `, [userId, Math.max(1, Math.min(limit, 50))]);
        return result.rows.map(mapPageAgentConversation);
    },
    async touch(id) {
        await (0, db_1.query)(`
      UPDATE page_agent_conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `, [id]);
    },
    async updateTitle(id, title) {
        await (0, db_1.query)(`
      UPDATE page_agent_conversations
      SET title = $1, updated_at = NOW()
      WHERE id = $2
      `, [title, id]);
    },
};
exports.pageAgentMessageStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
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
      `, [
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
        ]);
        return mapPageAgentMessage(result.rows[0]);
    },
    async getById(id) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM page_agent_messages
      WHERE id = $1
      LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapPageAgentMessage(result.rows[0]);
    },
    async listRecentByConversation(conversationId, limit) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM page_agent_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `, [conversationId, Math.max(1, Math.min(limit, 100))]);
        return result.rows.reverse().map(mapPageAgentMessage);
    },
    async listRecentByUser(userId, limit) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM page_agent_messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `, [userId, Math.max(1, Math.min(limit, 100))]);
        return result.rows.reverse().map(mapPageAgentMessage);
    },
    async listDistinctUserIdsForProfileAnalysis(limit) {
        const result = await (0, db_1.query)(`
      SELECT DISTINCT user_id
      FROM page_agent_messages
      ORDER BY user_id ASC
      LIMIT $1
      `, [Math.max(1, Math.min(limit, 200))]);
        return result.rows.map((item) => item.user_id);
    },
};
exports.userProfileStore = {
    async getByUserId(userId) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM user_profiles
      WHERE user_id = $1
      LIMIT 1
      `, [userId]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapUserProfile(result.rows[0]);
    },
    async upsertByUser(userId, input) {
        const result = await (0, db_1.query)(`
      INSERT INTO user_profiles (
        user_id,
        profile_version,
        preference_summary,
        persona_prompt,
        interest_topics,
        response_preferences,
        evidence_stats,
        last_analyzed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        profile_version = EXCLUDED.profile_version,
        preference_summary = EXCLUDED.preference_summary,
        persona_prompt = EXCLUDED.persona_prompt,
        interest_topics = EXCLUDED.interest_topics,
        response_preferences = EXCLUDED.response_preferences,
        evidence_stats = EXCLUDED.evidence_stats,
        last_analyzed_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `, [
            userId,
            input.profileVersion,
            input.preferenceSummary,
            input.personaPrompt.slice(0, 500),
            input.interestTopics,
            JSON.stringify(input.responsePreferences),
            JSON.stringify(input.evidenceStats),
        ]);
        return mapUserProfile(result.rows[0]);
    },
};
exports.userProfileAnalysisJobStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
      INSERT INTO user_profile_analysis_jobs (
        trigger_mode,
        target_user_id,
        status
      )
      VALUES ($1, $2, 'pending')
      RETURNING *
      `, [input.triggerMode, input.targetUserId ?? null]);
        return mapUserProfileAnalysisJob(result.rows[0]);
    },
    async getById(id) {
        const result = await (0, db_1.query)(`
      SELECT *
      FROM user_profile_analysis_jobs
      WHERE id = $1
      LIMIT 1
      `, [id]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapUserProfileAnalysisJob(result.rows[0]);
    },
    async markRunning(id) {
        await (0, db_1.query)(`
      UPDATE user_profile_analysis_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
      `, [id]);
    },
    async updateCounters(id, input) {
        await (0, db_1.query)(`
      UPDATE user_profile_analysis_jobs
      SET processed_count = $2,
          success_count = $3,
          failed_count = $4
      WHERE id = $1
      `, [id, input.processedCount, input.successCount, input.failedCount]);
    },
    async markSuccess(id) {
        const result = await (0, db_1.query)(`
      UPDATE user_profile_analysis_jobs
      SET status = 'success', finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `, [id]);
        return mapUserProfileAnalysisJob(result.rows[0]);
    },
    async markFailed(id, errorMessage) {
        const result = await (0, db_1.query)(`
      UPDATE user_profile_analysis_jobs
      SET status = 'failed', error_message = $2, finished_at = NOW()
      WHERE id = $1
      RETURNING *
      `, [id, errorMessage]);
        return mapUserProfileAnalysisJob(result.rows[0]);
    },
};
exports.wecomConfigStore = {
    async getEnabledConfig(appCode) {
        const values = [];
        const conditions = ["enabled = TRUE"];
        if (appCode) {
            values.push(appCode);
            conditions.push(`app_code = $${values.length}`);
        }
        const result = await (0, db_1.query)(`
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
      `, values);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapWecomAppConfig(result.rows[0]);
    },
};
exports.wecomTagMappingStore = {
    async list(params) {
        const values = [];
        const conditions = [];
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
        const result = await (0, db_1.query)(`
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
      `);
        return result.rows.map(mapWecomTagMapping);
    },
    async listEnabled() {
        return this.list({ enabledOnly: true });
    },
    async getByChannelCodeAndFrequency(channelCode, frequency) {
        const result = await (0, db_1.query)(`
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
      `, [channelCode, frequency]);
        if (result.rows.length === 0) {
            return undefined;
        }
        return mapWecomTagMapping(result.rows[0]);
    },
    async upsert(input) {
        const result = await (0, db_1.query)(`
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
      `, [
            input.channelCode,
            input.frequency,
            input.tagId,
            input.tagName,
            input.enabled ?? true,
        ]);
        return mapWecomTagMapping(result.rows[0]);
    },
    async markSyncResult(id, input) {
        await (0, db_1.query)(`
      UPDATE wecom_tag_mappings
      SET
        last_sync_status = $2,
        last_sync_error = $3,
        last_synced_at = $4,
        updated_at = NOW()
      WHERE id = $1
      `, [id, input.status, input.errorMessage ?? null, input.syncedAt ?? null]);
    },
};
exports.pushRecordStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
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
      `, [
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
        ]);
        return mapPushRecord(result.rows[0]);
    },
    async markSuccess(id, input) {
        await (0, db_1.query)(`
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
      `, [
            id,
            input.retryCount,
            input.wecomErrcode,
            input.wecomErrmsg,
            input.wecomMsgid ?? null,
            input.responseCode ?? null,
            JSON.stringify(input.responsePayload),
        ]);
    },
    async markFailed(id, input) {
        await (0, db_1.query)(`
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
      `, [
            id,
            input.retryCount,
            input.wecomErrcode ?? null,
            input.wecomErrmsg ?? null,
            JSON.stringify(input.responsePayload ?? {}),
            input.errorDetail,
        ]);
    },
    async listRecent(limit = 20) {
        const safeLimit = Math.max(1, Math.min(limit, 100));
        const result = await (0, db_1.query)(`
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
      `, [safeLimit]);
        return result.rows.map(mapPushRecord);
    },
    async listTodayArticlesByUserIds(userIds) {
        const normalizedUserIds = [...new Set(userIds.map((item) => item.trim()).filter(Boolean))];
        if (normalizedUserIds.length === 0) {
            return [];
        }
        const result = await (0, db_1.query)(`
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
      `, [normalizedUserIds]);
        return result.rows.map((row) => ({
            pushRecordId: row.push_record_id,
            sentAt: row.sent_at,
            article: mapArticle(row),
        }));
    },
};
exports.feedbackStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
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
      `, [
            input.userId,
            input.type,
            input.content,
            input.contact ?? null,
            input.pageRoute,
            input.pageTitle,
            input.source,
        ]);
        return mapFeedbackEntry(result.rows[0]);
    },
    async list(filters) {
        const conditions = [];
        const values = [];
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
            const itemsResult = await (0, db_1.query)(`
        SELECT
          fe.id, fe.user_id, fe.type, fe.content, fe.contact,
          fe.page_route, fe.page_title, fe.source, fe.status,
          fe.admin_note, fe.created_at,
          ev.eval_type, ev.severity, ev.fix_scope, ev.alignment,
          ev.suggested_action, ev.suggestion, ev.evaluated_at
        FROM feedback_entries fe
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
        `, values);
            const countResult = await (0, db_1.query)(`
        SELECT COUNT(*)::text AS total
        FROM feedback_entries
        ${whereClause}
        `, values.slice(0, values.length - 2));
            return {
                items: itemsResult.rows.map(mapFeedbackEntry),
                total: Number(countResult.rows[0]?.total ?? 0),
            };
        }
        const itemsResult = await (0, db_1.query)(`
      SELECT
        id,
        user_id,
        type,
        content,
        contact,
        page_route,
        page_title,
        source,
        status,
        admin_note,
        created_at
      FROM feedback_entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `, values);
        const countResult = await (0, db_1.query)(`
      SELECT COUNT(*)::text AS total
      FROM feedback_entries
      ${whereClause}
      `, values.slice(0, values.length - 2));
        return {
            items: itemsResult.rows.map(mapFeedbackEntry),
            total: Number(countResult.rows[0]?.total ?? 0),
        };
    },
    async update(id, input) {
        const sets = [];
        const values = [];
        if (input.status) {
            values.push(input.status);
            sets.push(`status = $${values.length}`);
        }
        if (input.adminNote !== undefined) {
            values.push(input.adminNote);
            sets.push(`admin_note = $${values.length}`);
        }
        if (sets.length === 0)
            return null;
        values.push(id);
        const result = await (0, db_1.query)(`UPDATE feedback_entries SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`, values);
        if (result.rows.length === 0)
            return null;
        return mapFeedbackEntry(result.rows[0]);
    },
};
exports.feedbackLikeStore = {
    async listPublic(params) {
        const conditions = [
            `fe.status = ANY($1::text[])`,
        ];
        const values = [
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
        const itemsResult = await (0, db_1.query)(`SELECT fe.id, fe.user_id, fe.type, fe.content, fe.page_route, fe.page_title, fe.status, fe.admin_note, fe.created_at,
              COUNT(fl.id) AS like_count
       FROM feedback_entries fe
       LEFT JOIN feedback_likes fl ON fl.feedback_id = fe.id
       WHERE fe.status = ANY($1::text[])
       GROUP BY fe.id
       ${orderClause}
       LIMIT ${limitPlaceholder}
       OFFSET ${offsetPlaceholder}`, values);
        const countResult = await (0, db_1.query)(`SELECT COUNT(*)::text AS total FROM feedback_entries fe WHERE fe.status = ANY($1::text[])`, [["approved", "verified", "deployed", "wontfix", "reverted"]]);
        const items = itemsResult.rows.map((row) => ({
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
            const feedbackIds = items.map((i) => i.id);
            const likesResult = await (0, db_1.query)(`SELECT feedback_id FROM feedback_likes WHERE feedback_id = ANY($1::text[]) AND user_id = $2`, [feedbackIds, params.currentUserId]);
            const likedSet = new Set(likesResult.rows.map((r) => r.feedback_id));
            for (const item of items) {
                item.likedByMe = likedSet.has(item.id);
            }
        }
        return { items: items, total: Number(countResult.rows[0]?.total ?? 0) };
    },
    async like(feedbackId, userId) {
        await (0, db_1.query)(`INSERT INTO feedback_likes (feedback_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [feedbackId, userId]);
    },
    async unlike(feedbackId, userId) {
        await (0, db_1.query)(`DELETE FROM feedback_likes WHERE feedback_id = $1 AND user_id = $2`, [feedbackId, userId]);
    },
    async getLikeCount(feedbackId) {
        const result = await (0, db_1.query)(`SELECT COUNT(*)::text AS count FROM feedback_likes WHERE feedback_id = $1`, [feedbackId]);
        return Number(result.rows[0]?.count ?? 0);
    },
};
exports.analyticsEventStore = {
    async create(input) {
        const result = await (0, db_1.query)(`
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
      `, [
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
        ]);
        return mapAnalyticsEvent(result.rows[0]);
    },
    async countByEventName(input) {
        const values = [input.eventName];
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
        const result = await (0, db_1.query)(`
      SELECT COUNT(*)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `, values);
        return Number(result.rows[0]?.total ?? 0);
    },
    async countDistinctUsers(input) {
        const values = [];
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
        const result = await (0, db_1.query)(`
      SELECT COUNT(DISTINCT user_id)::text AS total
      FROM analytics_events
      WHERE ${conditions.join(" AND ")}
      `, values);
        return Number(result.rows[0]?.total ?? 0);
    },
    async listDailyTrend(input) {
        const result = await (0, db_1.query)(`
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
      `, [input.startAt, input.endAt]);
        return result.rows.map((row) => ({
            date: row.date,
            pv: Number(row.pv),
            uv: Number(row.uv),
            articleViews: Number(row.article_views),
        }));
    },
    async listChannelMetricGroups(input) {
        const result = await (0, db_1.query)(`
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
      `, [input.eventName, input.startAt, input.endAt]);
        return result.rows.map((row) => ({
            key: row.key,
            label: row.label,
            value: Number(row.value),
        }));
    },
    async listFeedbackTypeMetrics(input) {
        const result = await (0, db_1.query)(`
      SELECT
        COALESCE(event_payload->>'type', 'unknown') AS key,
        COUNT(*)::text AS value
      FROM analytics_events
      WHERE event_name = 'feedback_created'
        AND occurred_at >= $1::timestamptz
        AND occurred_at <= $2::timestamptz
      GROUP BY COALESCE(event_payload->>'type', 'unknown')
      ORDER BY COUNT(*) DESC, key ASC
      `, [input.startAt, input.endAt]);
        return result.rows.map((row) => ({
            key: row.key,
            label: row.key,
            value: Number(row.value),
        }));
    },
    async listTopArticles(input) {
        const result = await (0, db_1.query)(`
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
      `, [input.startAt, input.endAt, input.limit]);
        return result.rows.map((row) => ({
            articleId: row.article_id,
            title: row.title,
            channelCode: row.channel_code,
            channelName: row.channel_name ?? row.channel_code,
            viewCount: Number(row.view_count),
        }));
    },
    async listTopChannels(input) {
        const result = await (0, db_1.query)(`
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
      `, [input.startAt, input.endAt, input.limit]);
        return result.rows.map((row) => ({
            channelCode: row.channel_code,
            channelName: row.channel_name ?? row.channel_code,
            viewCount: Number(row.view_count),
        }));
    },
    async getStatus() {
        const result = await (0, db_1.query)(`
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
      `);
        return {
            latestEventAt: result.rows[0]?.latest_event_at ?? undefined,
            totalEvents: Number(result.rows[0]?.total_events ?? 0),
            todayEventCount: Number(result.rows[0]?.today_event_count ?? 0),
        };
    },
};
const recordAnalyticsEventSafely = async (input) => {
    try {
        await exports.analyticsEventStore.create(input);
    }
    catch (error) {
        logger_1.logger.error("analytics.event.write.failed", {
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
exports.recordAnalyticsEventSafely = recordAnalyticsEventSafely;
