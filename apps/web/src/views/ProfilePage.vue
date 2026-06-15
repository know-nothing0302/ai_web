<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Star, History, MessageSquare, ArrowLeft, Clock, MessageCircle } from "lucide-vue-next";
import {
  getFavorites,
  removeFavorite,
  getReadingHistory,
  getMyFeedback,
  listPageAgentConversations,
  getPageAgentConversationMessages,
  type FavoriteItem,
  type ReadingHistoryItem,
  type PaginatedResponse,
  type FeedbackListItem,
} from "../services/api";
import type { PageAgentConversation, PageAgentMessage } from "../page_agent/types";

const router = useRouter();
const activeTab = ref<"favorites" | "history" | "feedback" | "conversations">("favorites");

// Favorites
const favorites = ref<FavoriteItem[]>([]);
const favoritesPagination = ref({ page: 1, pageSize: 20, total: 0 });
const favoritesLoading = ref(false);

// Reading history
const history = ref<ReadingHistoryItem[]>([]);
const historyPagination = ref({ page: 1, pageSize: 20, total: 0 });
const historyLoading = ref(false);

// Conversations
const conversations = ref<PageAgentConversation[]>([]);
const conversationMessages = ref<Record<string, PageAgentMessage[]>>({});
const conversationsLoading = ref(false);
const expandedConvId = ref<string | null>(null);

// My feedback
const feedback = ref<FeedbackListItem[]>([]);
const feedbackPagination = ref({ page: 1, pageSize: 20, total: 0 });
const feedbackLoading = ref(false);

const loadFavorites = async (page = 1): Promise<void> => {
  favoritesLoading.value = true;
  try {
    const result: PaginatedResponse<FavoriteItem> = await getFavorites(page);
    favorites.value = result.items;
    favoritesPagination.value = result.pagination;
  } catch {
    favorites.value = [];
  } finally {
    favoritesLoading.value = false;
  }
};

const handleRemoveFavorite = async (articleId: string): Promise<void> => {
  try {
    await removeFavorite(articleId);
    await loadFavorites(favoritesPagination.value.page);
  } catch {
    // silent
  }
};

const loadHistory = async (page = 1): Promise<void> => {
  historyLoading.value = true;
  try {
    const result: PaginatedResponse<ReadingHistoryItem> = await getReadingHistory(page);
    history.value = result.items;
    historyPagination.value = result.pagination;
  } catch {
    history.value = [];
  } finally {
    historyLoading.value = false;
  }
};

const loadConversations = async (): Promise<void> => {
  conversationsLoading.value = true;
  try {
    const result = await listPageAgentConversations({ limit: 5, offset: 0 });
    conversations.value = result.items;
  } catch {
    conversations.value = [];
  } finally {
    conversationsLoading.value = false;
  }
};

const loadFeedback = async (page = 1): Promise<void> => {
  feedbackLoading.value = true;
  try {
    const result = await getMyFeedback({ page, pageSize: 20 });
    feedback.value = result.items;
    feedbackPagination.value = result.pagination;
  } catch {
    feedback.value = [];
  } finally {
    feedbackLoading.value = false;
  }
};

const toggleConversationMessages = async (convId: string): Promise<void> => {
  if (expandedConvId.value === convId) {
    expandedConvId.value = null;
    return;
  }
  expandedConvId.value = convId;
  if (!conversationMessages.value[convId]) {
    try {
      const messages = await getPageAgentConversationMessages(convId);
      conversationMessages.value[convId] = messages;
    } catch {
      conversationMessages.value[convId] = [];
    }
  }
};

const formatDate = (isoString?: string): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const goToArticle = (articleId: string): void => {
  router.push(`/articles/${articleId}`);
};

onMounted(() => {
  loadFavorites();
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <button @click="router.back()" class="flex items-center gap-2 text-[#4f6b8a] hover:text-[#01579b] transition-colors">
      <ArrowLeft class="w-4 h-4" />
      返回
    </button>

    <h1 class="text-2xl font-bold text-[#0f4069]">个人中心</h1>

    <!-- Tabs -->
    <div class="flex gap-1 bg-white/70 p-1 rounded-2xl border border-[#0288d1]/20 backdrop-blur-xl">
      <button
        v-for="tab in ([
          { key: 'favorites', label: '我的收藏', icon: Star },
          { key: 'history', label: '浏览历史', icon: History },
          { key: 'feedback', label: '我的反馈', icon: MessageCircle },
          { key: 'conversations', label: '对话历史', icon: MessageSquare },
        ] as const)"
        :key="tab.key"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex-1 justify-center"
        :class="activeTab === tab.key ? 'bg-[#b3e5fc]/70 text-[#01579b] shadow-sm border border-[#0288d1]/25' : 'text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] border border-transparent'"
        @click="activeTab = tab.key; tab.key === 'history' ? loadHistory() : tab.key === 'feedback' ? loadFeedback() : tab.key === 'conversations' ? loadConversations() : undefined"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Favorites Tab -->
    <div v-if="activeTab === 'favorites'" class="space-y-4">
      <div v-if="favoritesLoading" class="flex items-center justify-center py-16">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0288d1]"></div>
      </div>
      <div v-else-if="favorites.length === 0" class="glass-panel rounded-3xl p-12 text-center border shadow-sm">
        <Star class="w-12 h-12 mx-auto mb-4 text-[#b3e5fc]" />
        <h3 class="text-lg font-medium text-[#4f6b8a]">还没有收藏</h3>
        <p class="text-sm text-[#8aa3bc] mt-1">在文章详情页点击星标即可收藏</p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="item in favorites"
          :key="item.id"
          class="glass-panel rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          @click="goToArticle(item.articleId)"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-[#0f4069] line-clamp-1">{{ item.title }}</h3>
              <p class="text-sm text-[#6e89a3] line-clamp-2 mt-1">{{ item.summary }}</p>
              <div class="flex items-center gap-3 mt-3 text-xs text-[#8aa3bc]">
                <span class="flex items-center gap-1">
                  <Clock class="w-3 h-3" />
                  {{ formatDate(item.createdAt) }}
                </span>
                <span v-if="item.category" class="badge-ai !bg-[#e1f5fe] !text-[#0277bd]">{{ item.category }}</span>
              </div>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-xl p-2 text-[#f59e0b] hover:bg-[#fef3c7] transition-colors"
              title="取消收藏"
              @click.stop="handleRemoveFavorite(item.articleId)"
            >
              <Star class="w-5 h-5 fill-current" />
            </button>
          </div>
        </div>
        <div v-if="favoritesPagination.total > favoritesPagination.pageSize" class="flex items-center justify-center gap-2 pt-4">
          <button
            :disabled="favoritesPagination.page <= 1"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadFavorites(favoritesPagination.page - 1)"
          >
            上一页
          </button>
          <span class="text-sm text-[#8aa3bc]">{{ favoritesPagination.page }} / {{ Math.ceil(favoritesPagination.total / favoritesPagination.pageSize) }}</span>
          <button
            :disabled="favoritesPagination.page >= Math.ceil(favoritesPagination.total / favoritesPagination.pageSize)"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadFavorites(favoritesPagination.page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- History Tab -->
    <div v-if="activeTab === 'history'" class="space-y-4">
      <div v-if="historyLoading" class="flex items-center justify-center py-16">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0288d1]"></div>
      </div>
      <div v-else-if="history.length === 0" class="glass-panel rounded-3xl p-12 text-center border shadow-sm">
        <History class="w-12 h-12 mx-auto mb-4 text-[#b3e5fc]" />
        <h3 class="text-lg font-medium text-[#4f6b8a]">还没有浏览记录</h3>
        <p class="text-sm text-[#8aa3bc] mt-1">浏览文章后，记录将自动出现在这里</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="item in history"
          :key="item.id"
          class="glass-panel rounded-2xl p-4 border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          @click="goToArticle(item.articleId)"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-[#0f4069] line-clamp-1">{{ item.title }}</h3>
              <div class="flex items-center gap-3 mt-2 text-xs text-[#8aa3bc]">
                <span class="flex items-center gap-1">
                  <Clock class="w-3 h-3" />
                  {{ formatDate(item.viewedAt) }}
                </span>
                <span v-if="item.category" class="badge-ai !bg-[#e1f5fe] !text-[#0277bd]">{{ item.category }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="historyPagination.total > historyPagination.pageSize" class="flex items-center justify-center gap-2 pt-4">
          <button
            :disabled="historyPagination.page <= 1"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadHistory(historyPagination.page - 1)"
          >
            上一页
          </button>
          <span class="text-sm text-[#8aa3bc]">{{ historyPagination.page }} / {{ Math.ceil(historyPagination.total / historyPagination.pageSize) }}</span>
          <button
            :disabled="historyPagination.page >= Math.ceil(historyPagination.total / historyPagination.pageSize)"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadHistory(historyPagination.page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback Tab -->
    <div v-if="activeTab === 'feedback'" class="space-y-4">
      <div v-if="feedbackLoading" class="flex items-center justify-center py-16">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0288d1]"></div>
      </div>
      <div v-else-if="feedback.length === 0" class="glass-panel rounded-3xl p-12 text-center border shadow-sm">
        <MessageCircle class="w-12 h-12 mx-auto mb-4 text-[#b3e5fc]" />
        <h3 class="text-lg font-medium text-[#4f6b8a]">还没有反馈记录</h3>
        <p class="text-sm text-[#8aa3bc] mt-1">在任意页面提交反馈后，记录将出现在这里</p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="item in feedback"
          :key="item.id"
          class="glass-panel rounded-2xl p-4 border shadow-sm"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="{
                    'bg-[#ffebee] text-[#c62828]': item.type === 'bug',
                    'bg-[#e1f5fe] text-[#0277bd]': item.type === 'ux',
                    'bg-[#f3e5f5] text-[#6a1b9a]': item.type === 'content',
                    'bg-[#e8f5e9] text-[#2e7d32]': item.type === 'other',
                  }"
                >
                  {{ { bug: '问题', ux: '体验', content: '内容', other: '其他' }[item.type] || item.type }}
                </span>
                <span class="rounded-full px-2 py-0.5 text-xs"
                  :class="{
                    'bg-[#fff3e0] text-[#e65100]': item.status === 'pending',
                    'bg-[#e8f5e9] text-[#2e7d32]': ['approved','verified','deployed'].includes(item.status),
                    'bg-[#f5f5f5] text-[#616161]': ['wontfix','snoozed'].includes(item.status),
                  }"
                >
                  {{ { pending: '待处理', evaluating: '评估中', approved: '已批准', wontfix: '暂缓', snoozed: '已搁置', in_progress: '处理中', testing: '测试中', verified: '已验证', deployed: '部署中', failed_testing: '测试未过', reverted: '已回退', duplicate: '重复提交' }[item.status] || item.status }}
                </span>
              </div>
              <p class="mt-2 text-sm text-[#4f6b8a] break-words">{{ item.content }}</p>
              <div v-if="item.adminNote" class="mt-2 rounded-xl bg-[#e1f5fe]/70 border border-[#b3e5fc] px-3 py-2 text-xs text-[#0277bd]">
                <span class="font-medium">处理说明：</span>{{ item.adminNote }}
              </div>
              <div class="mt-2 flex items-center gap-3 text-xs text-[#8aa3bc]">
                <span>{{ formatDate(item.createdAt) }}</span>
                <span>{{ item.pageTitle }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="feedbackPagination.total > feedbackPagination.pageSize" class="flex items-center justify-center gap-2 pt-4">
          <button
            :disabled="feedbackPagination.page <= 1"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadFeedback(feedbackPagination.page - 1)"
          >
            上一页
          </button>
          <span class="text-sm text-[#8aa3bc]">{{ feedbackPagination.page }} / {{ Math.ceil(feedbackPagination.total / feedbackPagination.pageSize) }}</span>
          <button
            :disabled="feedbackPagination.page >= Math.ceil(feedbackPagination.total / feedbackPagination.pageSize)"
            class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] transition-colors"
            @click="loadFeedback(feedbackPagination.page + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- Conversations Tab -->
    <div v-if="activeTab === 'conversations'" class="space-y-4">
      <div v-if="conversationsLoading" class="flex items-center justify-center py-16">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0288d1]"></div>
      </div>
      <div v-else-if="conversations.length === 0" class="glass-panel rounded-3xl p-12 text-center border shadow-sm">
        <MessageSquare class="w-12 h-12 mx-auto mb-4 text-[#b3e5fc]" />
        <h3 class="text-lg font-medium text-[#4f6b8a]">还没有对话历史</h3>
        <p class="text-sm text-[#8aa3bc] mt-1">使用 AI 智能助手后，对话记录将出现在这里</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="glass-panel rounded-2xl border shadow-sm overflow-hidden"
        >
          <button
            class="w-full flex items-center justify-between p-4 text-left hover:bg-[#f8fbfe] transition-colors"
            @click="toggleConversationMessages(conv.id)"
          >
            <div class="flex-1 min-w-0">
              <span class="font-medium text-[#0f4069] line-clamp-1 block">{{ conv.pageTitle || "未命名对话" }}</span>
              <span class="text-xs text-[#8aa3bc] mt-0.5 block">{{ formatShortDate(conv.createdAt) }}</span>
            </div>
            <div class="shrink-0 ml-3">
              <div
                class="w-5 h-5 rounded-full border-2 border-[#b3e5fc] flex items-center justify-center transition-transform"
                :class="expandedConvId === conv.id ? 'rotate-180' : ''"
              >
                <span class="text-xs text-[#8aa3bc]">▼</span>
              </div>
            </div>
          </button>
          <div v-if="expandedConvId === conv.id" class="border-t border-[#b3e5fc]/40 px-4 py-3 space-y-3 bg-[#f8fbfe]/60">
            <div v-if="!conversationMessages[conv.id]" class="text-sm text-[#8aa3bc] text-center py-4">
              加载中…
            </div>
            <div
              v-for="msg in conversationMessages[conv.id]"
              :key="msg.id"
              class="flex"
              :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                v-if="msg.role === 'user'"
                class="max-w-[80%] rounded-2xl bg-[#0288d1] px-3 py-2 text-sm text-white"
              >
                {{ msg.text }}
              </div>
              <div
                v-else
                class="max-w-[85%] rounded-2xl border border-[#d8edf9] bg-white px-3 py-2 text-sm text-[#355878]"
              >
                <div class="line-clamp-6">{{ msg.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
