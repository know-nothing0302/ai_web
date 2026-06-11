export type UserRole = "admin" | "user";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  email?: string;
  phone?: string;
  attributes?: Record<string, string[]>;
}

export type ArticleStatus = "draft" | "published";

export interface ArticleChannel {
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  createdByUserId?: string;
  title: string;
  summary: string;
  content: string;
  sourceContent?: string;
  originalUrl?: string;
  channelCode: string;
  channelName?: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionFrequency = "daily" | "weekly" | "instant";

export interface Subscription {
  id: string;
  userId: string;
  channelCodes: string[];
  categories: string[];
  frequency: SubscriptionFrequency;
  qywxUserId: string;
  qywxUserName?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WecomAppConfig {
  id: string;
  appCode: string;
  corpId: string;
  agentId: number;
  secret: string;
  callbackToken?: string;
  callbackAesKey?: string;
  internalAuthToken?: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TagSyncStatus = "idle" | "success" | "partial" | "failed";

export interface WecomTagMapping {
  id: string;
  channelCode: string;
  frequency: SubscriptionFrequency;
  tagId: number;
  tagName: string;
  enabled: boolean;
  lastSyncStatus: TagSyncStatus;
  lastSyncError?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PushRecordStatus = "pending" | "success" | "failed";

export type PushDeliveryMode = "user" | "tag" | "fallback_user" | "batch_user" | "broadcast";

export interface PushRecord {
  id: string;
  articleId?: string;
  channelCode: string;
  subscriptionUserId?: string;
  qywxUserId: string;
  deliveryMode: PushDeliveryMode;
  wecomTagId?: number;
  wecomTagName?: string;
  messageType: string;
  title: string;
  summary: string;
  url: string;
  status: PushRecordStatus;
  retryCount: number;
  wecomErrcode?: number;
  wecomErrmsg?: string;
  wecomMsgid?: string;
  responseCode?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  errorDetail?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodayPushedArticle {
  pushRecordId: string;
  sentAt: string;
  article: Article;
}

export type PageAgentConversationStatus = "active" | "archived";

export type PageAgentMessageRole = "user" | "assistant" | "feedback";

export type PageAgentMessageType = "question" | "answer" | "feedback";

export type UserProfileAnalysisTriggerMode = "manual" | "scheduled";

export type UserProfileAnalysisJobStatus = "pending" | "running" | "success" | "failed";

export interface PageAgentConversation {
  id: string;
  userId: string;
  title?: string;
  pageType?: string;
  route?: string;
  pageTitle?: string;
  status: PageAgentConversationStatus;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageAgentMessage {
  id: string;
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
  createdAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  profileVersion: number;
  preferenceSummary: string;
  personaPrompt: string;
  interestTopics: string[];
  responsePreferences: Record<string, unknown>;
  evidenceStats: Record<string, unknown>;
  lastAnalyzedAt?: string;
  lastSourceWindowStart?: string;
  lastSourceWindowEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileAnalysisJob {
  id: string;
  triggerMode: UserProfileAnalysisTriggerMode;
  targetUserId?: string;
  status: UserProfileAnalysisJobStatus;
  processedCount: number;
  successCount: number;
  failedCount: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export type FeedbackType = "bug" | "ux" | "content" | "other";

export type FeedbackStatus =
  | "pending"
  | "evaluating"
  | "snoozed"
  | "approved"
  | "in_progress"
  | "testing"
  | "deployed"
  | "verified"
  | "failed_testing"
  | "reverted"
  | "wontfix"
  | "duplicate";

export interface FeedbackEvaluation {
  evalType: string;
  severity: string;
  fixScope: string;
  alignment: string;
  suggestedAction: string;
  suggestion: string;
  evaluatedAt: string;
}

export interface FeedbackEntry {
  id: string;
  userId: string;
  type: FeedbackType;
  content: string;
  contact?: string;
  pageRoute: string;
  pageTitle: string;
  source: string;
  status: FeedbackStatus;
  adminNote?: string;
  createdAt: string;
  evaluation?: FeedbackEvaluation;
}

export type AnalyticsEventType =
  | "page"
  | "article"
  | "push"
  | "subscription"
  | "feedback"
  | "agent";

export type AnalyticsEventName =
  | "page_view"
  | "article_view"
  | "article_published"
  | "push_sent"
  | "push_failed"
  | "subscription_updated"
  | "feedback_created"
  | "page_agent_conversation_created"
  | "page_agent_message_created";

export interface AnalyticsEvent {
  id: string;
  eventType: AnalyticsEventType;
  eventName: AnalyticsEventName;
  userId?: string;
  sessionId?: string;
  pageRoute?: string;
  pageTitle?: string;
  articleId?: string;
  channelCode?: string;
  sourceModule: string;
  eventPayload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface StatsOverview {
  pv: number;
  uv: number;
  articleViews: number;
  articlesPublished: number;
  pushTotal: number;
  pushSuccess: number;
  pushFailed: number;
  pushSuccessRate: number;
  feedbackCount: number;
  pageAgentConversationCount: number;
  pageAgentMessageCount: number;
  enabledSubscriptionCount: number;
}

export interface StatsMetricItem {
  key: string;
  label: string;
  value: number;
}

export interface StatsMetricGroup {
  items: StatsMetricItem[];
}

export interface StatsArticleRankingItem {
  articleId: string;
  title: string;
  channelCode: string;
  channelName: string;
  viewCount: number;
}

export interface StatsChannelRankingItem {
  channelCode: string;
  channelName: string;
  viewCount: number;
}

export interface StatsDistributions {
  channelViews: StatsMetricGroup;
  channelPublishes: StatsMetricGroup;
  channelPushes: StatsMetricGroup;
  feedbackTypes: StatsMetricGroup;
}

export interface StatsRankings {
  topArticles: { items: StatsArticleRankingItem[] };
  topChannels: { items: StatsChannelRankingItem[] };
}

export interface StatsStatus {
  latestEventAt?: string;
  totalEvents: number;
  todayEventCount: number;
}

export interface UserAnnotation {
  id: string;
  userId: string;
  articleId: string;
  selectedText: string;
  note?: string;
  color: string;
  startOffset: number;
  endOffset: number;
  createdAt: string;
  updatedAt: string;
}
