import axios from "axios";
import {
  type PageAgentContextPayload,
  type PageAgentConversation,
  type PageAgentMessage,
  type PageAgentRequestPayload,
  type PageAgentResponse,
  type PageAgentSource,
} from "../page_agent/types";

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceContent?: string;
  originalUrl?: string;
  channelCode: string;
  channelName?: string;
  category: string;
  tags: string[];
  status: "draft" | "published";
  author: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  channelCodes: string[];
  categories: string[];
  frequency: "daily" | "weekly" | "instant";
  qywxUserId: string;
  qywxUserName?: string;
  enabled: boolean;
}

export interface Channel {
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
}

export interface ArticleExtractResult {
  title?: string;
  content: string;
  sourceContent?: string;
  summary?: string;
  author?: string;
  channelCode?: string;
  originalUrl: string;
  publishedAt?: string;
  meta: {
    contentLength: number;
    missingFields: string[];
  };
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
}

const operatorAllowList = new Set(["100002013029"]);

export const canAccessAdminViews = (user: User | null): boolean => {
  if (!user) {
    return false;
  }
  if (user.role === "admin") {
    return true;
  }
  const userId = user.id?.trim() ?? "";
  const username = user.username?.trim() ?? "";
  return operatorAllowList.has(userId) || operatorAllowList.has(username);
};

export interface FeedbackPayload {
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact?: string;
  pageRoute: string;
  pageTitle: string;
}

export interface FeedbackListItem {
  id: string;
  userId: string;
  type: "bug" | "ux" | "content" | "other";
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

export interface FeedbackListResponse {
  items: FeedbackListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ArticleAiOptimizePayload {
  title?: string;
  content: string;
  summary?: string;
  channelCode?: string;
  originalUrl?: string;
}

export interface ArticleAiOptimizeResult {
  suggestedTitle?: string;
  suggestedSummary?: string;
  suggestedChannelCode?: string;
  optimizedContent?: string;
  notes?: string;
}

export interface TodayPushedArticleItem {
  pushRecordId: string;
  sentAt: string;
  article: Article;
}

export interface StatsOverviewResponse {
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

export interface StatsTrendItem {
  date: string;
  pv: number;
  uv: number;
  articleViews: number;
}

export interface StatsDistributionsResponse {
  channelViews: { items: Array<{ key: string; label: string; value: number }> };
  channelPublishes: { items: Array<{ key: string; label: string; value: number }> };
  channelPushes: { items: Array<{ key: string; label: string; value: number }> };
  feedbackTypes: { items: Array<{ key: string; label: string; value: number }> };
}

export interface StatsRankingsResponse {
  topArticles: {
    items: Array<{
      articleId: string;
      title: string;
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>;
  };
  topChannels: {
    items: Array<{
      channelCode: string;
      channelName: string;
      viewCount: number;
    }>;
  };
}

export interface StatsStatusResponse {
  latestEventAt?: string;
  totalEvents: number;
  todayEventCount: number;
}

const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;

const request = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? "";
      if (!url.includes("/auth/cas/") && !url.includes("/auth/me")) {
        import("../stores/auth").then(({ useAuthStore }) => {
          useAuthStore().clearUser();
          window.location.href = `${apiBase}/auth/cas/login?redirect=${encodeURIComponent(window.location.href)}`;
        });
      }
    }
    return Promise.reject(error);
  }
);

export const getCurrentUser = async (): Promise<User | null> => {
  const result = await request.get<{ user: User | null }>("/auth/me");
  return result.data.user;
};

export const listArticles = async (params: {
  channelCode?: string;
  category?: string;
  keyword?: string;
  status?: "draft" | "published";
}): Promise<Article[]> => {
  const result = await request.get<{ items: Article[] }>("/articles", { params });
  return result.data.items;
};

export const getArticle = async (id: string): Promise<Article> => {
  const result = await request.get<Article>(`/articles/${id}`);
  return result.data;
};

export const listTodayPushedArticles = async (): Promise<{
  date: string;
  total: number;
  items: TodayPushedArticleItem[];
}> => {
  const result = await request.get<{
    date: string;
    total: number;
    items: TodayPushedArticleItem[];
  }>("/articles/push-digests/today");
  return result.data;
};

export const reportPageView = async (payload: {
  pageRoute: string;
  pageTitle: string;
}): Promise<void> => {
  await request.post("/stats/events/page-view", payload);
};

export const reportArticleView = async (payload: {
  articleId: string;
  channelCode: string;
  pageRoute: string;
  pageTitle: string;
}): Promise<void> => {
  await request.post("/stats/events/article-view", payload);
};

export const getStatsOverview = async (params?: {
  startAt?: string;
  endAt?: string;
  channelCode?: string;
}): Promise<StatsOverviewResponse> => {
  const result = await request.get<StatsOverviewResponse>("/stats/overview", { params });
  return result.data;
};

export const getStatsTrends = async (params: {
  startAt: string;
  endAt: string;
}): Promise<StatsTrendItem[]> => {
  const result = await request.get<{ items: StatsTrendItem[] }>("/stats/trends", { params });
  return result.data.items;
};

export const getStatsDistributions = async (params: {
  startAt: string;
  endAt: string;
}): Promise<StatsDistributionsResponse> => {
  const result = await request.get<StatsDistributionsResponse>("/stats/distributions", {
    params,
  });
  return result.data;
};

export const getStatsRankings = async (params: {
  startAt: string;
  endAt: string;
  limit?: number;
}): Promise<StatsRankingsResponse> => {
  const result = await request.get<StatsRankingsResponse>("/stats/rankings", { params });
  return result.data;
};

export const getStatsStatus = async (): Promise<StatsStatusResponse> => {
  const result = await request.get<StatsStatusResponse>("/stats/status");
  return result.data;
};

export const createArticle = async (payload: {
  title: string;
  summary?: string;
  content: string;
  sourceContent?: string;
  authorName?: string;
  originalUrl?: string;
  publishedAt?: string;
  channelCode: string;
  category?: string;
  tags: string[];
  status: "draft" | "published";
}): Promise<Article> => {
  const result = await request.post<Article>("/articles", payload);
  return result.data;
};

export const updateArticle = async (
  id: string,
  payload: Partial<{
    title: string;
    summary: string;
    content: string;
    sourceContent: string;
    authorName: string;
    originalUrl: string;
    publishedAt: string;
    channelCode: string;
    category: string;
    tags: string[];
    status: "draft" | "published";
  }>
): Promise<Article> => {
  const result = await request.patch<Article>(`/articles/${id}`, payload);
  return result.data;
};

export const deleteArticle = async (id: string): Promise<void> => {
  await request.delete(`/articles/${id}`);
};

export const getMySubscriptions = async (): Promise<Subscription[]> => {
  const result = await request.get<{ items: Subscription[] }>("/subscriptions/me");
  return result.data.items;
};

export const saveMySubscription = async (payload: {
  channelCodes: string[];
  frequency: "daily" | "weekly" | "instant";
  enabled: boolean;
}): Promise<Subscription> => {
  const result = await request.put<Subscription>("/subscriptions/me", payload);
  return result.data;
};

export const summarizeByAiXy = async (content: string): Promise<string> => {
  const result = await request.post<{ summary: string }>("/ai/summary", { content });
  return result.data.summary;
};

export const extractArticleFromUrl = async (url: string): Promise<ArticleExtractResult> => {
  const result = await request.post<ArticleExtractResult>("/articles/extract-from-url", { url });
  return result.data;
};

export const triggerInstantPush = async (channelCode: string): Promise<number> => {
  const result = await request.post<{ pushedCount: number }>("/push/instant", {
    channelCode,
  });
  return result.data.pushedCount;
};

export const listChannels = async (): Promise<Channel[]> => {
  const result = await request.get<{ items: Channel[] }>("/channels");
  return result.data.items;
};

export const submitFeedback = async (payload: FeedbackPayload): Promise<void> => {
  await request.post("/feedback", payload);
};

export const getAdminFeedbackList = async (params: {
  startAt?: string;
  endAt?: string;
  type?: "bug" | "ux" | "content" | "other";
  page?: number;
  pageSize?: number;
}): Promise<FeedbackListResponse> => {
  const result = await request.get<FeedbackListResponse>("/feedback/admin", { params });
  return result.data;
};

export const optimizeArticleDraftByAi = async (
  payload: ArticleAiOptimizePayload
): Promise<ArticleAiOptimizeResult> => {
  const result = await request.post<ArticleAiOptimizeResult>("/articles/ai-optimize", payload);
  return result.data;
};

export const askPageAgent = async (
  payload: PageAgentRequestPayload
): Promise<PageAgentResponse> => {
  const result = await request.post<PageAgentResponse>("/page-agent/qa", payload);
  return result.data;
};

export const createPageAgentConversation = async (payload: {
  pageType: PageAgentContextPayload["pageType"];
  route: string;
  pageTitle: string;
}): Promise<PageAgentConversation> => {
  const result = await request.post<PageAgentConversation>("/page-agent/conversations", payload);
  return result.data;
};

export const listPageAgentConversations = async (): Promise<PageAgentConversation[]> => {
  const result = await request.get<{ items: PageAgentConversation[] }>("/page-agent/conversations");
  return result.data.items;
};

export const updatePageAgentConversationTitle = async (
  id: string,
  title: string
): Promise<void> => {
  await request.patch(`/page-agent/conversations/${id}`, { title });
};

interface BackendPageAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourcesPayload?: Array<{
    type: string;
    title: string;
    url: string;
    articleId?: string;
    originalUrl?: string;
    summary?: string;
  }>;
}

export interface FavoriteItem {
  id: string;
  articleId: string;
  title: string;
  summary: string;
  channelCode: string;
  category: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface ReadingHistoryItem {
  id: string;
  articleId: string;
  title: string;
  channelCode: string;
  category: string;
  viewedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export const addFavorite = async (articleId: string): Promise<{ id: string; createdAt: string }> => {
  const result = await request.post<{ id: string; createdAt: string }>("/profile/favorites", { articleId });
  return result.data;
};

export const removeFavorite = async (articleId: string): Promise<void> => {
  await request.delete(`/profile/favorites/${articleId}`);
};

export const checkFavorite = async (articleId: string): Promise<{ isFavorited: boolean; id?: string; createdAt?: string }> => {
  const result = await request.get<{ isFavorited: boolean; id?: string; createdAt?: string }>(
    `/profile/favorites/check/${articleId}`
  );
  return result.data;
};

export const getFavorites = async (page = 1): Promise<PaginatedResponse<FavoriteItem>> => {
  const result = await request.get<PaginatedResponse<FavoriteItem>>("/profile/favorites", {
    params: { page, pageSize: 20 },
  });
  return result.data;
};

export const getReadingHistory = async (page = 1, pageSize = 50): Promise<PaginatedResponse<ReadingHistoryItem>> => {
  const result = await request.get<PaginatedResponse<ReadingHistoryItem>>("/profile/history", {
    params: { page, pageSize },
  });
  return result.data;
};

export const reportReadingHistory = async (articleId: string): Promise<void> => {
  await request.post("/profile/history", { articleId });
};

export const getPageAgentConversationMessages = async (
  conversationId: string
): Promise<PageAgentMessage[]> => {
  const result = await request.get<{ items: BackendPageAgentMessage[] }>(
    `/page-agent/conversations/${conversationId}/messages`
  );
  return result.data.items.map((msg) => ({
    id: msg.id,
    role: msg.role,
    text: msg.content,
    sources: msg.sourcesPayload as PageAgentSource[] | undefined,
  }));
};

// --- Birthday push admin ---

export interface BirthdayPushLogItem {
  id: string;
  userXh: string;
  xm: string;
  csrq: string | null;
  cardPath: string | null;
  blessingText: string | null;
  pushedAt: string;
  status: string;
  pushedTo: string[];
  errorMessage: string | null;
}

export const getBirthdayLogs = async (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}): Promise<PaginatedResponse<BirthdayPushLogItem>> => {
  const result = await request.get<PaginatedResponse<BirthdayPushLogItem>>(
    "/internal/birthday/logs",
    { params }
  );
  return result.data;
};

export const resendBirthdayPush = async (payload: {
  xh: string;
  blessing: string;
}): Promise<{ message: string; name: string; cardPath: string; status: string; pushedTo: string[] }> => {
  const result = await request.post<{ message: string; name: string; cardPath: string; status: string; pushedTo: string[] }>(
    "/internal/birthday/resend",
    payload
  );
  return result.data;
};

export const getBirthdayBlessing = async (): Promise<{ blessingTemplate: string }> => {
  const result = await request.get<{ blessingTemplate: string }>("/internal/birthday/blessing");
  return result.data;
};

export const updateBirthdayBlessing = async (payload: {
  blessingTemplate: string;
}): Promise<{ message: string; blessingTemplate: string }> => {
  const result = await request.put<{ message: string; blessingTemplate: string }>(
    "/internal/birthday/blessing",
    payload
  );
  return result.data;
};

export interface SearchUserItem {
  xh: string;
  xm: string;
  csrq: string | null;
}

export const searchBirthdayUsers = async (keyword: string): Promise<SearchUserItem[]> => {
  const result = await request.get<{ items: SearchUserItem[] }>("/internal/birthday/users/search", {
    params: { keyword },
  });
  return result.data.items;
};

// --- Birthday preview ---
export interface BirthdayCardPreview {
  cardBase64: string;
  xm: string;
  blessing: string;
}

export const getBirthdayPreview = async (payload: {
  xm: string;
  csrq: string;
  blessing: string;
}): Promise<BirthdayCardPreview> => {
  const result = await request.post<BirthdayCardPreview>("/internal/birthday/preview", payload);
  return result.data;
};

// --- Birthday push result ---
export interface BirthdayPushResult {
  status: "success" | "failed";
  name: string;
  pushedTo?: string[];
  errorDetail?: string;
}

// --- Feedback admin update ---
export const updateFeedbackStatus = async (
  id: string,
  payload: { status?: string; adminNote?: string }
): Promise<FeedbackListItem> => {
  const result = await request.patch<FeedbackListItem>(`/feedback/admin/${id}`, payload);
  return result.data;
};

export const getAdminFeedbackEvalList = async (params: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<FeedbackListResponse> => {
  const result = await request.get<FeedbackListResponse>("/feedback/admin", {
    params: { ...params, includeEval: true },
  });
  return result.data;
};

export const getMyFeedback = async (params: {
  page?: number;
  pageSize?: number;
}): Promise<FeedbackListResponse> => {
  const result = await request.get<FeedbackListResponse>("/feedback/my", { params });
  return result.data;
};

// --- Feedback public wall ---

export interface FeedbackPublicItem {
  id: string;
  userId: string;
  type: "bug" | "ux" | "content" | "other";
  content: string;
  pageRoute: string;
  pageTitle: string;
  status: string;
  adminNote?: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface FeedbackPublicListResponse {
  items: FeedbackPublicItem[];
  total: number;
}

export const getFeedbackPublicList = async (params: {
  page?: number;
  pageSize?: number;
  sort?: "recent" | "popular";
}): Promise<FeedbackPublicListResponse> => {
  const result = await request.get<FeedbackPublicListResponse>("/feedback/public", { params });
  return result.data;
};

// --- Birthday push toggle ---
export const getBirthdayPushToggle = async () => {
  const result = await request.get<{ enabled: boolean }>("/internal/birthday/push-toggle");
  return result.data;
};

export const updateBirthdayPushToggle = async (payload: { enabled: boolean }) => {
  const result = await request.put<{ enabled: boolean }>("/internal/birthday/push-toggle", payload);
  return result.data;
};

export const likeFeedback = async (id: string): Promise<{ likedByMe: boolean; likeCount: number }> => {
  const result = await request.post<{ likedByMe: boolean; likeCount: number }>(`/feedback/public/${id}/like`);
  return result.data;
};

export const unlikeFeedback = async (id: string): Promise<{ likedByMe: boolean; likeCount: number }> => {
  const result = await request.delete<{ likedByMe: boolean; likeCount: number }>(`/feedback/public/${id}/like`);
  return result.data;
};
