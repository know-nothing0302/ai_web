import { ref } from "vue";

import { type PageAgentContextPayload } from "./types";

export const currentPageAgentContext = ref<PageAgentContextPayload | null>(null);

export const setPageAgentContext = (payload: PageAgentContextPayload | null): void => {
  currentPageAgentContext.value = payload;
};

export const getSelectionText = (): string => {
  return window.getSelection?.()?.toString().trim() ?? "";
};

export const buildArticleDetailContext = (input: {
  route: string;
  pageTitle: string;
  article: {
    id: string;
    title: string;
    summary: string;
    content: string;
    sourceContent?: string;
    author: string;
    publishedAt?: string;
    channelCode: string;
    channelName?: string;
    originalUrl?: string;
  };
}): PageAgentContextPayload => ({
  pageType: "article_detail",
  route: input.route,
  pageTitle: input.pageTitle,
  selectionText: getSelectionText(),
  context: {
    articleId: input.article.id,
    title: input.article.title,
    summary: input.article.summary,
    contentPreview: input.article.content.slice(0, 3000),
    sourceContent: input.article.sourceContent,
    author: input.article.author,
    publishedAt: input.article.publishedAt,
    channelCode: input.article.channelCode,
    channelName: input.article.channelName,
    originalUrl: input.article.originalUrl,
  },
});

export const buildArticleListContext = (input: {
  route: string;
  pageTitle: string;
  keyword: string;
  category?: string;
  channelCode: string;
  channelName?: string;
  currentPage: number;
  pageSize: number;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    author: string;
    publishedAt?: string;
  }>;
}): PageAgentContextPayload => ({
  pageType: "article_list",
  route: input.route,
  pageTitle: input.pageTitle,
  selectionText: getSelectionText(),
  context: {
    keyword: input.keyword,
    category: input.category,
    channelCode: input.channelCode,
    channelName: input.channelName,
    currentPage: input.currentPage,
    pageSize: input.pageSize,
    items: input.items,
  },
});

export const buildSubscriptionContext = (input: {
  route: string;
  pageTitle: string;
  enabled: boolean;
  frequency: string;
  channelCodes: string[];
}): PageAgentContextPayload => ({
  pageType: "subscription",
  route: input.route,
  pageTitle: input.pageTitle,
  selectionText: "",
  context: {
    enabled: input.enabled,
    frequency: input.frequency,
    channelCodes: input.channelCodes,
  },
});

export const buildAdminContext = (input: {
  route: string;
  pageTitle: string;
  extractUrl: string;
  titleDraft: string;
  summaryDraft: string;
  channelCode: string;
  publishedAt: string;
  filterChannel: string;
  selectedCount: number;
  items: Array<{
    id: string;
    title: string;
    status: string;
    channelCode: string;
  }>;
}): PageAgentContextPayload => ({
  pageType: "admin",
  route: input.route,
  pageTitle: input.pageTitle,
  selectionText: "",
  context: {
    extractUrl: input.extractUrl,
    titleDraft: input.titleDraft,
    summaryDraft: input.summaryDraft,
    channelCode: input.channelCode,
    publishedAt: input.publishedAt,
    filterChannel: input.filterChannel,
    selectedCount: input.selectedCount,
    articleListPreview: input.items,
  },
});
