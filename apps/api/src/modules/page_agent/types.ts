export type PageAgentPageType =
  | "article_detail"
  | "article_list"
  | "subscription"
  | "admin";

export interface PageAgentRequestBody {
  conversationId: string;
  question: string;
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentSource {
  type: "current_page" | "article";
  title: string;
  url: string;
  articleId?: string;
  originalUrl?: string;
  summary?: string;
}

export interface PageAgentResponse {
  conversationId: string;
  answer: string;
  sources: PageAgentSource[];
  meta: {
    usedCurrentPage: boolean;
    usedSiteSearch: boolean;
    usedHistory: boolean;
    usedUserProfile: boolean;
    model: string;
  };
}
