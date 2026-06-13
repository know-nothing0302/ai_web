<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ThumbsUp, MessageSquare, Bug, Sparkles, FileText, HelpCircle, Loader2 } from "lucide-vue-next";
import {
  getFeedbackPublicList,
  likeFeedback,
  unlikeFeedback,
  type FeedbackPublicItem,
} from "../services/api";

const loading = ref(true);
const items = ref<FeedbackPublicItem[]>([]);
const total = ref(0);
const sortMode = ref<"recent" | "popular">("popular");
const statusFilter = ref<"all" | "replied" | "resolved" | "deferred">("all");
const liking = ref<Set<string>>(new Set());
const message = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const PAGE_SIZES = [20, 50, 100];
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const statusFilters = [
  { key: "all" as const, label: "全部" },
  { key: "replied" as const, label: "已回复" },
  { key: "resolved" as const, label: "已解决" },
  { key: "deferred" as const, label: "待定" },
];

const showMessage = (text: string) => {
  message.value = text;
  window.setTimeout(() => { message.value = ""; }, 2500);
};

const typeIcon = (type: string) => {
  switch (type) {
    case "bug": return Bug;
    case "ux": return Sparkles;
    case "content": return FileText;
    default: return HelpCircle;
  }
};

const typeLabel = (type: string): string => {
  switch (type) {
    case "bug": return "功能修复";
    case "ux": return "体验优化";
    case "content": return "内容改进";
    default: return "其他建议";
  }
};

const typeColor = (type: string): string => {
  switch (type) {
    case "bug": return "bg-[#ffebee] text-[#c62828] dark:bg-red-950/40 dark:text-red-300";
    case "ux": return "bg-[#e8f5e9] text-[#2e7d32] dark:bg-green-950/40 dark:text-green-300";
    case "content": return "bg-[#e3f2fd] text-[#1565c0] dark:bg-blue-950/40 dark:text-blue-300";
    default: return "bg-[#f3e5f5] text-[#6a1b9a] dark:bg-purple-950/40 dark:text-purple-300";
  }
};

const statusLabel = (status: string): string => {
  switch (status) {
    case "approved": return "已批准";
    case "verified": return "已验证";
    case "deployed": return "部署中";
    case "wontfix": return "暂缓";
    case "reverted": return "已回滚";
    default: return status;
  }
};

const statusColor = (status: string): string => {
  switch (status) {
    case "approved": return "bg-[#e3f2fd] text-[#0d47a1] dark:bg-blue-950/40 dark:text-blue-300";
    case "verified": return "bg-[#e8f5e9] text-[#1b5e20] dark:bg-green-950/40 dark:text-green-300";
    case "deployed": return "bg-[#e8f5e9] text-[#1b5e20] dark:bg-green-950/40 dark:text-green-300";
    case "wontfix": return "bg-[#fff3e0] text-[#e65100] dark:bg-orange-950/40 dark:text-orange-300";
    case "reverted": return "bg-[#ffebee] text-[#b71c1c] dark:bg-red-950/40 dark:text-red-300";
    default: return "bg-[#f5f5f5] text-[#616161] dark:bg-slate-700 dark:text-slate-300";
  }
};

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
};

const filterStatusSet = (filter: typeof statusFilter.value): Set<string> => {
  switch (filter) {
    case "replied": return new Set(["approved"]);
    case "resolved": return new Set(["verified", "deployed"]);
    case "deferred": return new Set(["wontfix", "reverted"]);
    default: return new Set(["approved", "verified", "deployed", "wontfix", "reverted"]);
  }
};

const filteredItems = computed(() => {
  if (statusFilter.value === "all") return items.value;
  const allowed = filterStatusSet(statusFilter.value);
  return items.value.filter((item) => allowed.has(item.status));
});

const loadList = async (page?: number) => {
  if (page !== undefined) currentPage.value = page;
  console.log("[AIWEB] FeedbackPublicPage loadList 开始", { sort: sortMode.value, statusFilter: statusFilter.value, page: currentPage.value, pageSize: pageSize.value });
  loading.value = true;
  try {
    const result = await getFeedbackPublicList({ page: currentPage.value, pageSize: pageSize.value, sort: sortMode.value });
    console.log("[AIWEB] FeedbackPublicPage loadList 成功", { total: result.total, items: result.items.length });
    items.value = result.items;
    total.value = result.total;
  } catch (err) {
    console.error("[AIWEB] FeedbackPublicPage loadList 失败", err);
    items.value = [];
    showMessage("加载失败");
  } finally {
    loading.value = false;
  }
};

const toggleLike = async (item: FeedbackPublicItem) => {
  if (liking.value.has(item.id)) return;
  liking.value = new Set([...liking.value, item.id]);
  try {
    if (item.likedByMe) {
      const result = await unlikeFeedback(item.id);
      item.likedByMe = result.likedByMe;
      item.likeCount = result.likeCount;
    } else {
      const result = await likeFeedback(item.id);
      item.likedByMe = result.likedByMe;
      item.likeCount = result.likeCount;
    }
  } catch {
    showMessage("操作失败");
  } finally {
    const next = new Set(liking.value);
    next.delete(item.id);
    liking.value = next;
  }
};

const switchSort = (mode: "recent" | "popular") => {
  if (sortMode.value === mode) return;
  sortMode.value = mode;
  loadList(1);
};

const handlePageSizeChange = (e: Event) => {
  pageSize.value = Number((e.target as HTMLSelectElement).value);
  loadList(1);
};

onMounted(() => {
  console.log("[AIWEB] FeedbackPublicPage onMounted 入口");
  loadList();
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0288d1] to-[#01579b] flex items-center justify-center shadow-md shrink-0">
          <MessageSquare class="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-[#0f4069] dark:text-[#e2e8f0]">反馈墙</h1>
          <p class="mt-1 text-sm text-[#4f6b8a] dark:text-[#cbd5e1]">用户反馈公示 · 已采纳 {{ total }} 条建议</p>
        </div>
      </div>
    </section>

    <!-- Sort + Filter tabs -->
    <div class="flex items-center gap-2 flex-wrap">
      <button
        class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
        :class="sortMode === 'recent' ? 'bg-[#0288d1] text-white' : 'bg-white/80 border border-[#b3e5fc] text-[#4f6b8a] hover:bg-[#e1f5fe] dark:bg-slate-800/80 dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700'"
        @click="switchSort('recent')"
      >
        最新
      </button>
      <button
        class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
        :class="sortMode === 'popular' ? 'bg-[#0288d1] text-white' : 'bg-white/80 border border-[#b3e5fc] text-[#4f6b8a] hover:bg-[#e1f5fe] dark:bg-slate-800/80 dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700'"
        @click="switchSort('popular')"
      >
        最热
      </button>
      <span class="mx-1 text-[#b3e5fc] dark:text-slate-600">|</span>
      <template v-for="f in statusFilters" :key="f.key">
        <button
          class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          :class="statusFilter === f.key ? 'bg-[#0288d1] text-white' : 'bg-white/80 border border-[#b3e5fc] text-[#4f6b8a] hover:bg-[#e1f5fe] dark:bg-slate-800/80 dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700'"
          @click="statusFilter = f.key"
        >
          {{ f.label }}
        </button>
      </template>
    </div>

    <div v-if="loading" class="glass-panel rounded-3xl border p-12 text-center text-sm text-[#6e89a3] dark:text-[#94a3b8]">
      <Loader2 class="inline-block w-5 h-5 animate-spin mr-2" />加载中...
    </div>

    <template v-else>
      <div v-if="filteredItems.length === 0" class="glass-panel rounded-3xl border p-12 text-center text-sm text-[#6e89a3] dark:text-[#94a3b8]">
        暂无已处理的反馈
      </div>

      <div class="space-y-4">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="glass-panel rounded-2xl border border-[#d8edf9] bg-white/85 p-5 transition-all duration-200 hover:border-[#b3e5fc] hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/85 dark:hover:border-slate-600"
        >
          <div class="flex items-start gap-4">
            <!-- Type icon -->
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              :class="typeColor(item.type)">
              <component :is="typeIcon(item.type)" class="w-5 h-5" />
            </div>

            <div class="min-w-0 flex-1">
              <!-- Header -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-medium rounded-full px-2 py-0.5"
                  :class="typeColor(item.type)">
                  {{ typeLabel(item.type) }}
                </span>
                <span class="text-xs rounded-full px-2 py-0.5"
                  :class="statusColor(item.status)">
                  {{ statusLabel(item.status) }}
                </span>
                <span class="text-xs text-[#6e89a3] dark:text-[#94a3b8]">{{ formatDate(item.createdAt) }}</span>
              </div>

              <!-- Content -->
              <p class="mt-2 text-sm text-[#0f4069] leading-relaxed dark:text-[#e2e8f0]">{{ item.content }}</p>
              <p v-if="item.adminNote" class="mt-1.5 text-xs text-[#0288d1] bg-[#e1f5fe] rounded-lg px-3 py-1.5 inline-block dark:text-[#38bdf8] dark:bg-slate-700/60">
                {{ item.adminNote }}
              </p>
              <p class="mt-1 text-xs text-[#6e89a3] dark:text-[#94a3b8]">{{ item.pageTitle }}</p>
            </div>

            <!-- Like button -->
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all shrink-0 self-start"
              :class="item.likedByMe
                ? 'bg-[#0288d1] text-white'
                : 'border border-[#b3e5fc] text-[#4f6b8a] hover:bg-[#e1f5fe] dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700'"
              :disabled="liking.has(item.id)"
              @click="toggleLike(item)"
            >
              <ThumbsUp class="w-3.5 h-3.5" :class="liking.has(item.id) ? 'animate-pulse' : ''" />
              <span class="font-medium">{{ item.likeCount }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="total > pageSize"
        class="flex items-center justify-center gap-3 pt-6"
      >
        <select
          :value="pageSize"
          class="rounded-lg border border-[#b3e5fc] px-2 py-1.5 text-sm text-[#4f6b8a] bg-white focus:outline-none focus:border-[#4fc3f7] dark:border-slate-600 dark:text-[#cbd5e1] dark:bg-slate-800"
          @change="handlePageSizeChange"
        >
          <option v-for="ps in PAGE_SIZES" :key="ps" :value="ps">{{ ps }}条/页</option>
        </select>
        <button
          :disabled="currentPage <= 1"
          class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700"
          @click="loadList(currentPage - 1)"
        >
          上一页
        </button>
        <span class="text-sm text-[#8aa3bc] dark:text-[#94a3b8]">
          {{ currentPage }} / {{ totalPages }}（共 {{ total }} 条）
        </span>
        <button
          :disabled="currentPage >= totalPages"
          class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-600 dark:text-[#cbd5e1] dark:hover:bg-slate-700"
          @click="loadList(currentPage + 1)"
        >
          下一页
        </button>
      </div>
    </template>

    <!-- Message -->
    <div
      v-if="message"
      class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)] dark:border-slate-600 dark:bg-slate-800/96 dark:text-[#e2e8f0]"
    >
      {{ message }}
    </div>
  </div>
</template>
