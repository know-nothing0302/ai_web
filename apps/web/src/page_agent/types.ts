export type PageAgentPageType =
  | "article_detail"
  | "article_list"
  | "subscription"
  | "admin";

export interface PageAgentContextPayload {
  pageType: PageAgentPageType;
  route: string;
  pageTitle: string;
  selectionText?: string;
  context: Record<string, unknown>;
}

export interface PageAgentRequestPayload extends PageAgentContextPayload {
  conversationId: string;
  question: string;
  verbosity?: "concise" | "detailed";
  citationStyle?: "none" | "gbt7714" | "apa";
}

export interface PageAgentConversation {
  id: string;
  title?: string;
  pageType?: string;
  route?: string;
  pageTitle?: string;
  status: "active" | "archived";
  createdAt: string;
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

export interface PageAgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: PageAgentSource[];
  meta?: PageAgentResponse["meta"];
}
