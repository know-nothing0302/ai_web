<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
defineOptions({ name: "ArticlesPage" });
import { RouterLink, useRoute } from "vue-router";
import {
  Search,
  Sparkles,
  ArrowRight,
  Activity,
  BrainCircuit,
  BookOpenText,
  GraduationCap,
  Microscope,
  ShieldCheck,
  Newspaper,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
} from "lucide-vue-next";
import { listArticles, listChannels, getReadingHistory, submitFeedback, type Article } from "../services/api";
import { buildArticleListContext, setPageAgentContext } from "../page_agent/context";
import { sanitizeCardText } from "../shared/text_sanitizer";
import { useSearchHistory } from "../composables/useSearchHistory";
import BackToTop from "../components/BackToTop.vue";

type ChannelItem = {
  key: string;
  label: string;
  icon: unknown;
  tip: string;
};

const keyword = ref("");
const channelCode = ref("");
const route = useRoute();
const loading = ref(false);
const items = ref<Article[]>([]);
const activeChannel = ref("");
const currentPage = ref(1);
const pageSize = 9;
const { searchHistory, addSearchHistory, clearHistory } = useSearchHistory();
const isSearchFocused = ref(false);
const readArticleIds = ref<Set<string>>(new Set());

// Topic suggestion
const topicText = ref("");
const topicSubmitting = ref(false);
const topicSuccess = ref(false);

const submitTopicSuggestion = async (): Promise<void> => {
  const text = topicText.value.trim();
  if (!text || text.length < 5 || topicSubmitting.value) return;
  topicSubmitting.value = true;
  try {
    await submitFeedback({
      type: "content",
      content: `[主题征集] ${text}`,
      pageRoute: "/",
      pageTitle: "主题征集",
    });
    topicText.value = "";
    topicSuccess.value = true;
    setTimeout(() => { topicSuccess.value = false; }, 3000);
  } catch {
    // silently fail — non-blocking
  } finally {
    topicSubmitting.value = false;
  }
};

const fetchReadArticleIds = async (): Promise<void> => {
  try {
    const result = await getReadingHistory(1, 50);
    readArticleIds.value = new Set(result.items.map((h) => h.articleId));
  } catch {
    // not critical — fails silently
  }
};

const onSearchFocus = (): void => {
  isSearchFocused.value = true;
};
const onSearchBlur = (): void => {
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 200);
};

const channelIconMap: Record<string, unknown> = {
  "daily-ai-summary": Newspaper,
  "policy-ethics": ShieldCheck,
  "medical-frontier": Microscope,
  "campus-news": Activity,
  "edu-plus-ai": BookOpenText,
  "tools-recommend": BrainCircuit,
  "student-zone": GraduationCap,
};

const channels = ref<ChannelItem[]>([]);

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(items.value.length / pageSize));
});

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return items.value.slice(start, start + pageSize);
});

const resetToFirstPage = (): void => {
  currentPage.value = 1;
};

function syncSearchParamsToUrl(): void {
  const query: Record<string, string> = {};
  if (keyword.value) query.keyword = keyword.value;
  if (channelCode.value) query.channelCode = channelCode.value;
  if (currentPage.value > 1) query.page = String(currentPage.value);
  const qs = new URLSearchParams(query).toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

const handleSearch = (): void => {
  resetToFirstPage();
  if (keyword.value.trim()) {
    addSearchHistory(keyword.value.trim());
  }
  syncSearchParamsToUrl();
  load();
};

const handleHistoryChipClick = (term: string): void => {
  keyword.value = term;
  handleSearch();
};

const goPrevPage = (): void => {
  if (currentPage.value > 1) {
    currentPage.value -= 1;
    syncSearchParamsToUrl();
  }
};

const goNextPage = (): void => {
  if (currentPage.value < totalPages.value) {
    currentPage.value += 1;
    syncSearchParamsToUrl();
  }
};

const load = async (silent = false): Promise<void> => {
  console.info("[AIWEB] ArticlesPage 开始加载资讯列表", {
    keyword: keyword.value || "",
    channelCode: channelCode.value || "",
    channel: activeChannel.value,
  });
  if (!silent) loading.value = true;
  try {
    items.value = await listArticles({
      keyword: keyword.value || undefined,
      channelCode: channelCode.value || undefined,
      status: "published",
    });
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
    console.info("[AIWEB] ArticlesPage 资讯列表加载完成", { count: items.value.length });
  } catch (err) {
    console.error("[AIWEB] ArticlesPage 加载文章列表失败", err);
    // In silent mode, keep existing items on error (avoid blank)
    if (!silent) items.value = [];
  } finally {
    loading.value = false;
  }
};

const getCardText = (value?: string): string => sanitizeCardText(value);

const openChannel = (channel: ChannelItem | null): void => {
  if (channel) {
    activeChannel.value = channel.key;
    channelCode.value = channel.key;
    console.info("[AIWEB] ArticlesPage 切换栏目", { channel: channel.label });
  } else {
    activeChannel.value = "";
    channelCode.value = "";
    console.info("[AIWEB] ArticlesPage 切换栏目", { channel: "全部" });
  }
  resetToFirstPage();
  syncSearchParamsToUrl();
  load();
};

const loadChannels = async (): Promise<void> => {
  try {
    const data = await listChannels();
    channels.value = data.map((item) => ({
      key: item.code,
      label: item.name,
      icon: channelIconMap[item.code] ?? Newspaper,
      tip: item.description || "栏目内容聚合",
    }));
  } catch (err) {
    console.error("[AIWEB] ArticlesPage 频道列表加载失败", err);
  }
};

onMounted(async () => {
  console.group("[AIWEB] ArticlesPage");
  console.log("[AIWEB] ArticlesPage onMounted 入口", { hasKeyword: !!route.query.keyword, hasChannelCode: !!route.query.channelCode, page: route.query.page });

  // Restore search state from URL query params
  if (route.query.keyword) keyword.value = route.query.keyword as string;
  if (route.query.channelCode) channelCode.value = route.query.channelCode as string;
  if (route.query.page) currentPage.value = Math.max(1, parseInt(route.query.page as string, 10) || 1);

  console.log("[AIWEB] ArticlesPage loadChannels 开始");
  await loadChannels();
  console.log("[AIWEB] ArticlesPage loadChannels 完成", { channelCount: channels.value.length });
  console.log("[AIWEB] ArticlesPage load 开始", { page: currentPage.value, pageSize, channelCode: channelCode.value, keyword: keyword.value });
  await load();
  console.log("[AIWEB] ArticlesPage fetchReadArticleIds 开始");
  await fetchReadArticleIds();
  console.log("[AIWEB] ArticlesPage fetchReadArticleIds 完成", { count: readArticleIds.value.size });
  console.groupEnd();
});

onBeforeUnmount(() => {
  setPageAgentContext(null);
});

onActivated(async () => {
  console.log("[AIWEB] ArticlesPage onActivated 入口", { itemsLength: items.value.length, loading: loading.value });
  syncSearchParamsToUrl();
  fetchReadArticleIds();
  // Always reload on reactivation to prevent stale/blank state after back-navigation;
  // use silent mode when items already exist to avoid loading-spinner flash.
  const hasItems = items.value.length > 0;
  console.log("[AIWEB] ArticlesPage onActivated 触发 reload", { hasItems });
  try { await load(hasItems); } catch (err) { console.error("[AIWEB] ArticlesPage onActivated load 失败", err); }
});

watchEffect(() => {
  const activeChannelName =
    channels.value.find((item) => item.key === channelCode.value)?.label ?? "";
  setPageAgentContext(
    buildArticleListContext({
      route: route.fullPath,
      pageTitle: "资讯发现",
      keyword: keyword.value,
      channelCode: channelCode.value,
      channelName: activeChannelName,
      currentPage: currentPage.value,
      pageSize,
      items: paginatedItems.value.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        author: item.author,
        publishedAt: item.publishedAt,
      })),
    })
  );
});
</script>

<template>
  <div class="space-y-6">
    <!-- Compact Header & Navigation -->
    <section class="glass-panel relative z-20 overflow-visible rounded-3xl p-6 md:p-8 border shadow-sm">
      <div class="flex flex-col md:flex-row justify-between gap-6 mb-8">
        <div class="space-y-2 flex-1">
          <p class="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.1em] uppercase text-[#0277bd] dark:text-[#7dd3fc] bg-[#e1f5fe] dark:bg-sky-900/30 border border-[#81d4fa]/70 dark:border-sky-700/50 rounded-full px-3 py-1 mb-2">
            <Sparkles class="w-3.5 h-3.5" />
            医学与教育 AI 资讯门户
          </p>
          <h1 class="text-3xl font-bold text-[#0f4069] dark:text-[#e2e8f0]">资讯发现</h1>
          <p class="text-sm text-[#4f6b8a] dark:text-[#cbd5e1] max-w-2xl">聚合政策、科研、校内动态和学习资源，帮助你快速建立 AI 认知与行动路径。</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 w-full md:w-[480px] min-w-0">
          <div class="flex items-center h-12 rounded-2xl border border-[#81d4fa]/70 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 shadow-[0_0_0_3px_rgba(129,212,250,0.12)] dark:shadow-none focus-within:border-[#0288d1] dark:focus-within:border-sky-500 focus-within:shadow-[0_0_0_4px_rgba(2,136,209,0.15)] dark:focus-within:shadow-[0_0_0_4px_rgba(56,189,248,0.2)] transition-all">
            <Search class="w-4 h-4 text-[#0288d1] dark:text-[#38bdf8] mr-2 shrink-0" />
            <input
              v-model="keyword"
              @keyup.enter="handleSearch"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              class="w-full h-full bg-transparent border-0 outline-none text-sm text-[#355878] dark:text-slate-200 placeholder:text-[#7d97b1] dark:placeholder:text-slate-500"
              placeholder="搜索政策、医学AI..."
            />
          </div>
          <button
            type="button"
            class="btn-primary h-12 px-8 text-sm shrink-0 shadow-md shadow-[#0288d1]/20 whitespace-nowrap rounded-2xl"
            @click="handleSearch"
          >
            搜索
          </button>
        </div>
      </div>

      <!-- Search History Chips -->
      <div v-if="isSearchFocused && searchHistory.length > 0" class="-mt-2 mb-4 flex flex-wrap items-center gap-2">
        <span class="text-xs text-[#4f6b8a] dark:text-[#cbd5e1] mr-1">最近搜索：</span>
        <button
          v-for="term in searchHistory"
          :key="term"
          type="button"
          class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-white/80 dark:bg-slate-800/80 border border-[#81d4fa]/50 dark:border-slate-600 text-[#0288d1] dark:text-[#38bdf8] hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 hover:border-[#0288d1] dark:hover:border-sky-500 transition-colors"
          @click="handleHistoryChipClick(term)"
        >
          {{ term }}
        </button>
        <button
          type="button"
          class="text-xs text-[#8aa3bc] dark:text-slate-400 hover:text-[#4f6b8a] dark:hover:text-[#cbd5e1] hover:underline ml-1 transition-colors"
          @click="clearHistory"
        >
          清除历史
        </button>
      </div>

      <!-- Compact Channel Tabs -->
      <div class="flex flex-wrap gap-2 items-center">
        <button
          class="px-4 py-2 rounded-full text-sm font-medium transition-colors border"
          :class="activeChannel === '' ? 'bg-[#0288d1] text-white border-[#0288d1] shadow-md shadow-[#0288d1]/30' : 'bg-white/60 dark:bg-slate-800/60 text-[#4f6b8a] dark:text-[#cbd5e1] border-[#b3e5fc] dark:border-slate-600 hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 hover:text-[#01579b] dark:hover:text-[#7dd3fc]'"
          @click="openChannel(null)"
        >
          全部
        </button>
        <button
          v-for="channel in channels"
          :key="channel.key"
          type="button"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border"
          :class="activeChannel === channel.key ? 'bg-[#0288d1] text-white border-[#0288d1] shadow-md shadow-[#0288d1]/30' : 'bg-white/60 dark:bg-slate-800/60 text-[#4f6b8a] dark:text-[#cbd5e1] border-[#b3e5fc] dark:border-slate-600 hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 hover:text-[#01579b] dark:hover:text-[#7dd3fc]'"
          @click="openChannel(channel)"
        >
          <component :is="channel.icon" class="w-3.5 h-3.5" :class="activeChannel === channel.key ? 'text-white' : 'text-[#0288d1] dark:text-[#38bdf8]'" />
          {{ channel.label }}
        </button>
      </div>
    </section>

    <!-- 主题征集 Banner — 暂不开放，缺少收集后的联动处理机制 -->
    <section v-if="false" class="glass-panel rounded-2xl border border-[#b3e5fc] p-4 md:p-5 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[#e1bee7] to-[#ce93d8] flex items-center justify-center">
          <Lightbulb class="w-5 h-5 text-[#6a1b9a]" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-[#0f4069]">主题征集</p>
          <p class="text-xs text-[#6e89a3] mt-0.5">有想看的 AI 话题？告诉我们，内容团队会优先安排</p>
        </div>
      </div>
      <div class="flex items-center gap-2 mt-3">
        <input
          v-model="topicText"
          class="flex-1 h-10 rounded-xl border border-[#81d4fa]/60 bg-white px-3 text-sm text-[#355878] placeholder:text-[#9bb5cc] focus:border-[#ce93d8] focus:shadow-[0_0_0_3px_rgba(206,147,216,0.15)] outline-none transition-all"
          placeholder="例如：AI 在医学影像诊断中的应用"
          @keyup.enter="submitTopicSuggestion"
        />
        <button
          type="button"
          class="btn-primary h-10 px-5 text-sm shrink-0 rounded-xl shadow-md shadow-[#ce93d8]/20"
          :disabled="topicText.trim().length < 5 || topicSubmitting"
          @click="submitTopicSuggestion"
        >
          {{ topicSubmitting ? "提交中..." : topicSuccess ? "✓ 已提交" : "提交" }}
        </button>
      </div>
      <p v-if="topicSuccess" class="mt-2 text-xs text-green-600">感谢你的建议！我们会认真考虑。</p>
    </section>

    <!-- Content Section -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0288d1] dark:border-[#38bdf8]"></div>
    </div>

    <div v-else-if="items.length === 0" class="glass-card py-16 text-center border border-[#81d4fa]/30 dark:border-slate-600/30">
      <Sparkles class="w-10 h-10 text-[#4fc3f7] mx-auto mb-4 opacity-70" />
      <h3 class="text-lg font-medium text-[#01579b] dark:text-[#7dd3fc]">没有找到相关资讯</h3>
      <p class="text-sm text-[#4f6b8a] dark:text-[#cbd5e1] mt-2">尝试更换关键词、栏目或分类重新检索</p>
    </div>

    <div v-else class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <RouterLink
        v-for="item in paginatedItems"
        :key="item.id"
        :to="`/articles/${item.id}`"
        class="glass-card p-6 group flex flex-col h-full hover:shadow-xl hover:shadow-[#0288d1]/10 transition-all border border-transparent hover:border-[#b3e5fc]"
        :class="{ 'bg-read': readArticleIds.has(item.id) }"
      >
        <div class="flex items-center justify-between mb-4">
          <span class="badge-ai !bg-[#e1f5fe] !text-[#0277bd] dark:!bg-sky-900/40 dark:!text-[#7dd3fc]">{{ item.category }}</span>
        </div>

        <h3 class="text-[17px] font-semibold text-[#0f4069] dark:text-[#e2e8f0] mb-3 group-hover:text-[#0288d1] dark:group-hover:text-[#38bdf8] transition-colors line-clamp-2 leading-snug">
          {{ getCardText(item.title) }}
        </h3>

        <p class="text-[#4f6b8a] dark:text-[#cbd5e1] text-[13px] mb-6 flex-grow line-clamp-3 leading-relaxed">
          {{ getCardText(item.summary) }}
        </p>

        <div class="flex items-center justify-between mt-auto pt-4 border-t border-[#b3e5fc]/40 dark:border-slate-600/40">
          <span class="text-[11px] text-[#738ea6] dark:text-slate-400">由 {{ item.author }} 发布</span>
          <div class="flex items-center text-xs font-medium text-[#0288d1] dark:text-[#38bdf8] opacity-0 group-hover:opacity-100 transition-opacity">
            阅读全文 <ArrowRight class="w-3.5 h-3.5 ml-1" />
          </div>
        </div>
      </RouterLink>
      </div>

      <div
        v-if="items.length > pageSize"
        class="glass-panel rounded-2xl border px-4 py-3 flex items-center justify-between"
      >
        <p class="text-sm text-[#4f6b8a] dark:text-[#cbd5e1]">
          共 {{ items.length }} 条，当前第 {{ currentPage }} / {{ totalPages }} 页
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg border border-[#81d4fa] dark:border-slate-600 text-[#0288d1] dark:text-[#38bdf8] hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="currentPage === 1"
            @click="goPrevPage"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="p-2 rounded-lg border border-[#81d4fa] dark:border-slate-600 text-[#0288d1] dark:text-[#38bdf8] hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="currentPage === totalPages"
            @click="goNextPage"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <BackToTop />
  </div>
</template>

<style scoped>
.bg-read {
  background: #f3f7fb;
  border-color: rgba(2, 119, 189, 0.12);
  border-left: 3px solid rgba(2, 119, 189, 0.2);
  opacity: 0.82;
}
</style>
