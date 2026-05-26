<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
defineOptions({ name: "ArticlesPage" });
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  Search,
  Filter,
  Sparkles,
  Clock,
  ArrowRight,
  Activity,
  BrainCircuit,
  BookOpenText,
  GraduationCap,
  Microscope,
  ShieldCheck,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-vue-next";
import { listArticles, listChannels, getReadingHistory, type Article } from "../services/api";
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
const category = ref("");
const channelCode = ref("");
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const items = ref<Article[]>([]);
const activeChannel = ref("");
const currentPage = ref(1);
const pageSize = 9;
const { searchHistory, addSearchHistory, clearHistory } = useSearchHistory();
const isSearchFocused = ref(false);
const readArticleIds = ref<Set<string>>(new Set());

const fetchReadArticleIds = async (): Promise<void> => {
  try {
    const result = await getReadingHistory(1, 200);
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

const categories = ref<{ value: string; label: string }[]>([{ value: "", label: "全部栏目" }]);
const isCategoryDropdownOpen = ref(false);
const categoryDropdownRef = ref<HTMLElement | null>(null);

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

const selectedCategoryLabel = computed(() => {
  return categories.value.find((item) => item.value === category.value)?.label || "全部栏目";
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
  if (category.value) query.category = category.value;
  if (channelCode.value) query.channelCode = channelCode.value;
  if (currentPage.value > 1) query.page = String(currentPage.value);
  void router.replace({ query });
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

const load = async (): Promise<void> => {
  console.info("[ArticlesPage] 开始加载资讯列表", {
    keyword: keyword.value || "",
    category: category.value || "",
    channelCode: channelCode.value || "",
    channel: activeChannel.value,
  });
  loading.value = true;
  try {
    items.value = await listArticles({
      keyword: keyword.value || undefined,
      category: category.value || undefined,
      channelCode: channelCode.value || undefined,
      status: "published",
    });
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
    console.info("[ArticlesPage] 资讯列表加载完成", { count: items.value.length });
  } finally {
    loading.value = false;
  }
};

const formatDate = (isoString?: string) => {
  if (!isoString) return '刚刚';
  const date = new Date(isoString);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const getCardText = (value?: string): string => sanitizeCardText(value);

const openChannel = (channel: ChannelItem | null): void => {
  if (channel) {
    activeChannel.value = channel.key;
    channelCode.value = channel.key;
    console.info("[ArticlesPage] 切换栏目", { channel: channel.label });
  } else {
    activeChannel.value = "";
    channelCode.value = "";
    console.info("[ArticlesPage] 切换栏目", { channel: "全部" });
  }
  resetToFirstPage();
  syncSearchParamsToUrl();
  load();
};

const handleCategoryChange = (): void => {
  activeChannel.value = "";
  channelCode.value = "";
  resetToFirstPage();
  syncSearchParamsToUrl();
  load();
};

const toggleCategoryDropdown = (): void => {
  isCategoryDropdownOpen.value = !isCategoryDropdownOpen.value;
};

const closeCategoryDropdown = (): void => {
  isCategoryDropdownOpen.value = false;
};

const selectCategory = (value: string): void => {
  category.value = value;
  closeCategoryDropdown();
  handleCategoryChange();
};

const handleDocumentClick = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (!categoryDropdownRef.value?.contains(target)) {
    closeCategoryDropdown();
  }
};

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape") {
    closeCategoryDropdown();
  }
};

const loadChannels = async (): Promise<void> => {
  const data = await listChannels();
  categories.value = [
    { value: "", label: "全部栏目" },
    ...data.map((item) => ({ value: item.name, label: item.name })),
  ];
  channels.value = data.map((item) => ({
    key: item.code,
    label: item.name,
    icon: channelIconMap[item.code] ?? Newspaper,
    tip: item.description || "栏目内容聚合",
  }));
};

onMounted(async () => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  // Restore search state from URL query params
  if (route.query.keyword) keyword.value = route.query.keyword as string;
  if (route.query.category) category.value = route.query.category as string;
  if (route.query.channelCode) channelCode.value = route.query.channelCode as string;
  if (route.query.page) currentPage.value = Math.max(1, parseInt(route.query.page as string, 10) || 1);

  await loadChannels();
  await load();
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleDocumentKeydown);
  setPageAgentContext(null);
});

onActivated(() => {
  // When KeepAlive reactivates this component (e.g. navigating back from article detail),
  // ensure URL reflects the current search state
  syncSearchParamsToUrl();
  fetchReadArticleIds();
});

watchEffect(() => {
  const activeChannelName =
    channels.value.find((item) => item.key === channelCode.value)?.label ?? "";
  setPageAgentContext(
    buildArticleListContext({
      route: route.fullPath,
      pageTitle: "资讯发现",
      keyword: keyword.value,
      category: category.value,
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
          <p class="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.1em] uppercase text-[#0277bd] bg-[#e1f5fe] border border-[#81d4fa]/70 rounded-full px-3 py-1 mb-2">
            <Sparkles class="w-3.5 h-3.5" />
            医学与教育 AI 资讯门户
          </p>
          <h1 class="text-3xl font-bold text-[#0f4069]">资讯发现</h1>
          <p class="text-sm text-[#4f6b8a] max-w-2xl">聚合政策、科研、校内动态和学习资源，帮助你快速建立 AI 认知与行动路径。</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-3 w-full md:w-[700px] min-w-0">
          <div class="flex items-center h-12 rounded-2xl border border-[#81d4fa]/70 bg-white px-3 shadow-[0_0_0_3px_rgba(129,212,250,0.12)] focus-within:border-[#0288d1] focus-within:shadow-[0_0_0_4px_rgba(2,136,209,0.15)] transition-all">
            <Search class="w-4 h-4 text-[#0288d1] mr-2 shrink-0" />
            <input
              v-model="keyword"
              @keyup.enter="handleSearch"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              class="w-full h-full bg-transparent border-0 outline-none text-sm text-[#355878] placeholder:text-[#7d97b1]"
              placeholder="搜索政策、医学AI..."
            />
          </div>
          <div
            ref="categoryDropdownRef"
            class="relative flex items-center h-12 rounded-2xl border border-[#81d4fa]/70 bg-white px-3 shadow-[0_0_0_3px_rgba(129,212,250,0.12)] focus-within:border-[#0288d1] focus-within:shadow-[0_0_0_4px_rgba(2,136,209,0.15)] transition-all"
            :class="isCategoryDropdownOpen ? 'border-[#0288d1] shadow-[0_0_0_4px_rgba(2,136,209,0.15)]' : ''"
          >
            <Filter class="w-4 h-4 text-[#0288d1] mr-2 shrink-0" />
            <button
              type="button"
              class="w-full h-full text-left bg-transparent border-0 outline-none cursor-pointer text-sm text-[#355878] pr-7 truncate"
              :aria-expanded="isCategoryDropdownOpen"
              aria-haspopup="listbox"
              @click="toggleCategoryDropdown"
            >
              {{ selectedCategoryLabel }}
            </button>
            <ChevronDown class="w-4 h-4 text-[#4f6b8a] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform" :class="isCategoryDropdownOpen ? 'rotate-180' : ''" />
            <transition name="category-dropdown">
              <div
                v-if="isCategoryDropdownOpen"
                class="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-[#81d4fa]/70 bg-white p-1.5 shadow-[0_14px_30px_-14px_rgba(2,136,209,0.45)] backdrop-blur-sm"
                role="listbox"
              >
                <button
                  v-for="c in categories"
                  :key="c.value"
                  type="button"
                  class="w-full text-left px-3 py-2 rounded-xl text-sm transition-colors"
                  :class="category === c.value ? 'bg-[#0288d1] text-white shadow-sm' : 'text-[#355878] hover:bg-[#e1f5fe] hover:text-[#01579b]'"
                  @click="selectCategory(c.value)"
                >
                  {{ c.label }}
                </button>
              </div>
            </transition>
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
        <span class="text-xs text-[#4f6b8a] mr-1">最近搜索：</span>
        <button
          v-for="term in searchHistory"
          :key="term"
          type="button"
          class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-white/80 border border-[#81d4fa]/50 text-[#0288d1] hover:bg-[#e1f5fe] hover:border-[#0288d1] transition-colors"
          @click="handleHistoryChipClick(term)"
        >
          {{ term }}
        </button>
        <button
          type="button"
          class="text-xs text-[#8aa3bc] hover:text-[#4f6b8a] hover:underline ml-1 transition-colors"
          @click="clearHistory"
        >
          清除历史
        </button>
      </div>

      <!-- Compact Channel Tabs -->
      <div class="flex flex-wrap gap-2 items-center">
        <button
          class="px-4 py-2 rounded-full text-sm font-medium transition-colors border"
          :class="activeChannel === '' ? 'bg-[#0288d1] text-white border-[#0288d1] shadow-md shadow-[#0288d1]/30' : 'bg-white/60 text-[#4f6b8a] border-[#b3e5fc] hover:bg-[#e1f5fe] hover:text-[#01579b]'"
          @click="openChannel(null)"
        >
          全部
        </button>
        <button
          v-for="channel in channels"
          :key="channel.key"
          type="button"
          class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border"
          :class="activeChannel === channel.key ? 'bg-[#0288d1] text-white border-[#0288d1] shadow-md shadow-[#0288d1]/30' : 'bg-white/60 text-[#4f6b8a] border-[#b3e5fc] hover:bg-[#e1f5fe] hover:text-[#01579b]'"
          @click="openChannel(channel)"
        >
          <component :is="channel.icon" class="w-3.5 h-3.5" :class="activeChannel === channel.key ? 'text-white' : 'text-[#0288d1]'" />
          {{ channel.label }}
        </button>
      </div>
    </section>

    <!-- Content Section -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0288d1]"></div>
    </div>

    <div v-else-if="items.length === 0" class="glass-card py-16 text-center border border-[#81d4fa]/30">
      <Sparkles class="w-10 h-10 text-[#4fc3f7] mx-auto mb-4 opacity-70" />
      <h3 class="text-lg font-medium text-[#01579b]">没有找到相关资讯</h3>
      <p class="text-sm text-[#4f6b8a] mt-2">尝试更换关键词、栏目或分类重新检索</p>
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
          <span class="badge-ai !bg-[#e1f5fe] !text-[#0277bd]">{{ item.category }}</span>
          <span class="flex items-center gap-1 text-xs text-[#4f6b8a]">
            <Clock class="w-3 h-3" />
            {{ formatDate(item.publishedAt) }}
          </span>
        </div>
        
        <h3 class="text-[17px] font-semibold text-[#0f4069] mb-3 group-hover:text-[#0288d1] transition-colors line-clamp-2 leading-snug">
          {{ getCardText(item.title) }}
        </h3>
        
        <p class="text-[#4f6b8a] text-[13px] mb-6 flex-grow line-clamp-3 leading-relaxed">
          {{ getCardText(item.summary) }}
        </p>
        
        <div class="flex items-center justify-between mt-auto pt-4 border-t border-[#b3e5fc]/40">
          <span class="text-[11px] text-[#738ea6]">由 {{ item.author }} 发布</span>
          <div class="flex items-center text-xs font-medium text-[#0288d1] opacity-0 group-hover:opacity-100 transition-opacity">
            阅读全文 <ArrowRight class="w-3.5 h-3.5 ml-1" />
          </div>
        </div>
      </RouterLink>
      </div>

      <div
        v-if="items.length > pageSize"
        class="glass-panel rounded-2xl border px-4 py-3 flex items-center justify-between"
      >
        <p class="text-sm text-[#4f6b8a]">
          共 {{ items.length }} 条，当前第 {{ currentPage }} / {{ totalPages }} 页
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="currentPage === 1"
            @click="goPrevPage"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="p-2 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed"
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
.category-dropdown-enter-active,
.category-dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.category-dropdown-enter-from,
.category-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.bg-read {
  background: #f3f7fb;
  border-color: rgba(2, 119, 189, 0.12);
}
</style>
