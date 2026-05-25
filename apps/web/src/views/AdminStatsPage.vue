<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { BarChart3 } from "lucide-vue-next";

import {
  canAccessAdminViews,
  getAdminFeedbackList,
  getCurrentUser,
  getStatsDistributions,
  getStatsOverview,
  getStatsRankings,
  getStatsStatus,
  getStatsTrends,
  updateFeedbackStatus,
  type FeedbackListItem,
  type FeedbackStatus,
  type StatsDistributionsResponse,
  type StatsOverviewResponse,
  type StatsRankingsResponse,
  type StatsStatusResponse,
  type StatsTrendItem,
} from "../services/api";

const currentUserId = ref("");
const accessDenied = ref(false);
const statsLoading = ref(false);
const statsRange = ref<"last7days" | "last30days" | "today">("last7days");
const statsOverview = ref<StatsOverviewResponse | null>(null);
const statsTrendItems = ref<StatsTrendItem[]>([]);
const statsDistributions = ref<StatsDistributionsResponse | null>(null);
const statsRankings = ref<StatsRankingsResponse | null>(null);
const statsStatus = ref<StatsStatusResponse | null>(null);
const feedbackLoading = ref(false);
const feedbackError = ref("");
const feedbackItems = ref<FeedbackListItem[]>([]);
const selectedFeedback = ref<FeedbackListItem | null>(null);
const feedbackTypeFilter = ref<"" | "bug" | "ux" | "content" | "other">("");

const feedbackTypeOptions = [
  { label: "全部", value: "" },
  { label: "问题报错", value: "bug" },
  { label: "体验建议", value: "ux" },
  { label: "内容建议", value: "content" },
  { label: "其他", value: "other" },
] as const;
const feedbackActionMessage = ref("");
const editingStatus = ref<FeedbackStatus>("pending");
const editingAdminNote = ref("");
const savingFeedback = ref(false);

const statsRangeOptions = [
  { label: "近7天", value: "last7days" },
  { label: "近30天", value: "last30days" },
  { label: "今天", value: "today" },
] as const;

const topChannelViews = computed(() => statsDistributions.value?.channelViews.items ?? []);
const topChannelPublishes = computed(() => statsDistributions.value?.channelPublishes.items ?? []);
const topChannelPushes = computed(() => statsDistributions.value?.channelPushes.items ?? []);
const topFeedbackTypes = computed(() => statsDistributions.value?.feedbackTypes.items ?? []);
const topArticles = computed(() => statsRankings.value?.topArticles.items ?? []);
const topChannels = computed(() => statsRankings.value?.topChannels.items ?? []);

const getShanghaiDateParts = (value: Date): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  return {
    year: Number(parts.find((item) => item.type === "year")?.value ?? "1970"),
    month: Number(parts.find((item) => item.type === "month")?.value ?? "01"),
    day: Number(parts.find((item) => item.type === "day")?.value ?? "01"),
  };
};

const toShanghaiStartAt = (year: number, month: number, day: number): string =>
  new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000).toISOString();

const resolveStatsRange = (
  value: "last7days" | "last30days" | "today"
): { startAt: string; endAt: string } => {
  const now = new Date();
  const { year, month, day } = getShanghaiDateParts(now);
  const baseDate = new Date(Date.UTC(year, month - 1, day));

  if (value === "last7days") {
    baseDate.setUTCDate(baseDate.getUTCDate() - 6);
  } else if (value === "last30days") {
    baseDate.setUTCDate(baseDate.getUTCDate() - 29);
  }

  return {
    startAt: toShanghaiStartAt(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth() + 1,
      baseDate.getUTCDate()
    ),
    endAt: now.toISOString(),
  };
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatFeedbackType = (value: FeedbackListItem["type"]): string => {
  if (value === "bug") {
    return "问题报错";
  }
  if (value === "content") {
    return "内容建议";
  }
  if (value === "other") {
    return "其他";
  }
  return "体验建议";
};

const summarizeFeedback = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 48) {
    return normalized;
  }
  return `${normalized.slice(0, 48)}...`;
};

const showFeedbackActionMessage = (value: string): void => {
  feedbackActionMessage.value = value;
  window.setTimeout(() => {
    if (feedbackActionMessage.value === value) {
      feedbackActionMessage.value = "";
    }
  }, 2000);
};

const statusOptions = [
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "处理中" },
  { value: "optimized", label: "已优化" },
  { value: "implemented", label: "已实现" },
  { value: "wontfix", label: "暂缓" },
  { value: "duplicate", label: "重复" },
] as const;

const statusClass = (s: string): string => {
  const map: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    optimized: "bg-green-50 text-green-700",
    implemented: "bg-emerald-50 text-emerald-700",
    wontfix: "bg-amber-50 text-amber-700",
    duplicate: "bg-purple-50 text-purple-700",
  };
  return map[s] || "bg-gray-100 text-gray-600";
};

const statusLabel = (s: string): string => {
  const map: Record<string, string> = {
    pending: "待处理",
    in_progress: "处理中",
    optimized: "已优化",
    implemented: "已实现",
    wontfix: "暂缓",
    duplicate: "重复",
  };
  return map[s] || s;
};

const copyFeedbackValue = async (value: string, successMessage: string): Promise<void> => {
  if (!value.trim()) {
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    showFeedbackActionMessage(successMessage);
  } catch {
    showFeedbackActionMessage("复制失败，请稍后重试");
  }
};

const checkAccess = async (): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      accessDenied.value = true;
      return false;
    }
    const userId = user?.id?.trim() ?? "";
    const username = user?.username?.trim() ?? "";
    currentUserId.value = userId || username;
    accessDenied.value = false;
    return true;
  } catch {
    accessDenied.value = true;
    return false;
  }
};

const loadFeedbackList = async (
  params: { startAt: string; endAt: string }
): Promise<void> => {
  feedbackLoading.value = true;
  feedbackError.value = "";
  try {
    const result = await getAdminFeedbackList({
      ...params,
      type: feedbackTypeFilter.value || undefined,
      page: 1,
      pageSize: 10,
    });
    feedbackItems.value = result.items;
    if (
      selectedFeedback.value &&
      !result.items.some((item) => item.id === selectedFeedback.value?.id)
    ) {
      selectedFeedback.value = null;
    }
  } catch {
    feedbackItems.value = [];
    feedbackError.value = "反馈加载失败，请稍后重试";
    selectedFeedback.value = null;
  } finally {
    feedbackLoading.value = false;
  }
};

const loadStatsPage = async (): Promise<void> => {
  const params = resolveStatsRange(statsRange.value);
  statsLoading.value = true;
  try {
    const [overview, trends, distributions, rankings, status] = await Promise.all([
      getStatsOverview(params),
      getStatsTrends(params),
      getStatsDistributions(params),
      getStatsRankings({ ...params, limit: 5 }),
      getStatsStatus(),
    ]);
    statsOverview.value = overview;
    statsTrendItems.value = trends;
    statsDistributions.value = distributions;
    statsRankings.value = rankings;
    statsStatus.value = status;
    await loadFeedbackList(params);
  } finally {
    statsLoading.value = false;
  }
};

onMounted(async () => {
  const hasAccess = await checkAccess();
  if (hasAccess) {
    await loadStatsPage();
  }
});

watch(statsRange, async () => {
  if (!accessDenied.value) {
    await loadStatsPage();
  }
});

watch(feedbackTypeFilter, async () => {
  if (!accessDenied.value) {
    await loadFeedbackList(resolveStatsRange(statsRange.value));
  }
});

watch(selectedFeedback, (item) => {
  if (item) {
    editingStatus.value = item.status || "pending";
    editingAdminNote.value = item.adminNote || "";
  }
});

const handleSaveFeedback = async () => {
  if (!selectedFeedback.value) return;
  savingFeedback.value = true;
  try {
    await updateFeedbackStatus(selectedFeedback.value.id, {
      status: editingStatus.value,
      adminNote: editingAdminNote.value || undefined,
    });
    const idx = feedbackItems.value.findIndex((f) => f.id === selectedFeedback.value!.id);
    if (idx >= 0) {
      feedbackItems.value[idx] = {
        ...feedbackItems.value[idx],
        status: editingStatus.value as FeedbackStatus,
        adminNote: editingAdminNote.value || undefined,
      };
    }
    selectedFeedback.value = {
      ...selectedFeedback.value,
      status: editingStatus.value as FeedbackStatus,
      adminNote: editingAdminNote.value || undefined,
    };
    showFeedbackActionMessage("反馈状态已更新");
  } catch {
    showFeedbackActionMessage("保存失败");
  } finally {
    savingFeedback.value = false;
  }
};
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8">
    <section v-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="mt-2 text-[#4f6b8a]">
        当前账号（{{ currentUserId || "未知用户" }}）无权限访问。
      </p>
    </section>

    <template v-else>
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 class="flex items-center gap-3 text-3xl font-bold text-[#0f4069]">
              <BarChart3 class="h-8 w-8 text-[#0288d1]" />
              统计信息
            </h1>
            <p class="mt-2 text-[#4f6b8a]">
              管理员查看访问、浏览、发布、推送和反馈统计的专用页面
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in statsRangeOptions"
              :key="option.value"
              type="button"
              class="rounded-full border px-4 py-2 text-sm transition-colors"
              :class="
                statsRange === option.value
                  ? 'border-[#0288d1] bg-[#e1f5fe] text-[#0277bd]'
                  : 'border-[#b3e5fc] text-[#4f6b8a] hover:border-[#4fc3f7]'
              "
              @click="statsRange = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">当前统计范围</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsRangeOptions.find((item) => item.value === statsRange)?.label }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">最近采集时间</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ formatDateTime(statsStatus?.latestEventAt) }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">累计事件数</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsStatus?.totalEvents ?? 0 }}
          </p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">今日事件数</p>
          <p class="mt-2 text-xl font-bold text-[#0f4069]">
            {{ statsStatus?.todayEventCount ?? 0 }}
          </p>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">页面浏览量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.pv ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">访问用户数</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.uv ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">文章浏览量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.articleViews ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">文章发布量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.articlesPublished ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">推送总量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.pushTotal ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">推送成功率</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : `${statsOverview?.pushSuccessRate ?? 0}%` }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">反馈提交量</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.feedbackCount ?? 0 }}</p>
        </div>
        <div class="glass-panel rounded-2xl border p-5">
          <p class="text-sm text-[#4f6b8a]">启用订阅数</p>
          <p class="mt-2 text-2xl font-bold text-[#0f4069]">{{ statsLoading ? "--" : statsOverview?.enabledSubscriptionCount ?? 0 }}</p>
        </div>
      </section>

      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="grid gap-4 xl:grid-cols-2">
          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">每日趋势</h3>
            <div v-if="statsTrendItems.length === 0" class="mt-4 text-sm text-[#6e89a3]">
              {{ statsLoading ? "加载中..." : "当前时间范围暂无统计数据" }}
            </div>
            <div v-else class="mt-4 overflow-x-auto">
              <table class="min-w-full text-sm text-[#355878]">
                <thead>
                  <tr class="border-b border-[#e1f5fe] text-left text-[#4f6b8a]">
                    <th class="px-2 py-2">日期</th>
                    <th class="px-2 py-2">PV</th>
                    <th class="px-2 py-2">UV</th>
                    <th class="px-2 py-2">文章浏览量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in statsTrendItems" :key="item.date" class="border-b border-[#f1faff]">
                    <td class="px-2 py-2">{{ item.date }}</td>
                    <td class="px-2 py-2">{{ item.pv }}</td>
                    <td class="px-2 py-2">{{ item.uv }}</td>
                    <td class="px-2 py-2">{{ item.articleViews }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目浏览分布</h3>
              <div v-if="topChannelViews.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelViews" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目发布分布</h3>
              <div v-if="topChannelPublishes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelPublishes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">栏目推送分布</h3>
              <div v-if="topChannelPushes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topChannelPushes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
              <h3 class="text-base font-semibold text-[#0f4069]">反馈类型分布</h3>
              <div v-if="topFeedbackTypes.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
              <div v-else class="mt-4 space-y-3">
                <div v-for="item in topFeedbackTypes" :key="item.key" class="flex items-center justify-between text-sm">
                  <span class="text-[#355878]">{{ item.label }}</span>
                  <span class="font-semibold text-[#0f4069]">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-2">
          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">热门文章</h3>
            <div v-if="topArticles.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
            <div v-else class="mt-4 space-y-3">
              <div v-for="item in topArticles" :key="item.articleId" class="flex items-start justify-between gap-4 text-sm">
                <div class="min-w-0">
                  <p class="truncate font-medium text-[#355878]">{{ item.title }}</p>
                  <p class="mt-1 text-xs text-[#6e89a3]">{{ item.channelName }}</p>
                </div>
                <span class="shrink-0 font-semibold text-[#0f4069]">{{ item.viewCount }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-[#d8edf9] bg-white/80 p-5">
            <h3 class="text-base font-semibold text-[#0f4069]">热门栏目</h3>
            <div v-if="topChannels.length === 0" class="mt-4 text-sm text-[#6e89a3]">暂无统计数据</div>
            <div v-else class="mt-4 space-y-3">
              <div v-for="item in topChannels" :key="item.channelCode" class="flex items-center justify-between text-sm">
                <span class="text-[#355878]">{{ item.channelName }}</span>
                <span class="font-semibold text-[#0f4069]">{{ item.viewCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h3 class="text-lg font-semibold text-[#0f4069]">用户反馈</h3>
            <p class="mt-1 text-sm text-[#6e89a3]">查看当前统计范围内最近提交的反馈</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm text-[#4f6b8a]" for="feedback-type-filter">反馈类型</label>
            <select
              id="feedback-type-filter"
              v-model="feedbackTypeFilter"
              class="rounded-xl border border-[#b3e5fc] bg-white px-3 py-2 text-sm text-[#355878] outline-none transition-colors focus:border-[#4fc3f7]"
            >
              <option
                v-for="option in feedbackTypeOptions"
                :key="option.value || 'all'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div
          v-if="feedbackError"
          class="mt-4 rounded-2xl border border-[#ffd6d6] bg-[#fff7f7] px-4 py-3 text-sm text-[#b54747]"
        >
          {{ feedbackError }}
        </div>

        <div
          v-else-if="feedbackLoading"
          class="mt-4 rounded-2xl border border-[#d8edf9] bg-white/80 px-4 py-6 text-sm text-[#6e89a3]"
        >
          反馈加载中...
        </div>

        <div
          v-else-if="feedbackItems.length === 0"
          class="mt-4 rounded-2xl border border-[#d8edf9] bg-white/80 px-4 py-6 text-sm text-[#6e89a3]"
        >
          当前时间范围暂无反馈记录
        </div>

        <div v-else class="mt-4 overflow-x-auto">
          <table class="min-w-full text-sm text-[#355878]">
            <thead>
              <tr class="border-b border-[#e1f5fe] text-left text-[#4f6b8a]">
                <th class="px-2 py-2">提交时间</th>
                <th class="px-2 py-2">类型</th>
                <th class="px-2 py-2">状态</th>
                <th class="px-2 py-2">页面</th>
                <th class="px-2 py-2">内容摘要</th>
                <th class="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in feedbackItems"
                :key="item.id"
                class="border-b border-[#f1faff]"
              >
                <td class="px-2 py-3">{{ formatDateTime(item.createdAt) }}</td>
                <td class="px-2 py-3">{{ formatFeedbackType(item.type) }}</td>
                <td class="px-2 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium" :class="statusClass(item.status)">
                    {{ statusLabel(item.status) }}
                  </span>
                </td>
                <td class="px-2 py-3">{{ item.pageTitle || item.pageRoute }}</td>
                <td class="px-2 py-3">{{ summarizeFeedback(item.content) }}</td>
                <td class="px-2 py-3 text-right">
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe]"
                    @click="selectedFeedback = item"
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div
        v-if="selectedFeedback"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4"
      >
        <section
          class="w-full max-w-2xl rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-[#0f4069]">反馈详情</h3>
              <p class="mt-1 text-sm text-[#6e89a3]">
                {{ formatFeedbackType(selectedFeedback.type) }} ·
                {{ formatDateTime(selectedFeedback.createdAt) }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-xl px-3 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc] hover:text-[#0f4069]"
              @click="selectedFeedback = null"
            >
              关闭
            </button>
          </div>

          <div class="mt-5 space-y-4 text-sm text-[#355878]">
            <div>
              <div class="flex items-center justify-between gap-3">
                <p class="text-[#6e89a3]">反馈内容</p>
                <button
                  type="button"
                  class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe]"
                  @click="void copyFeedbackValue(selectedFeedback.content, '已复制反馈内容')"
                >
                  复制反馈内容
                </button>
              </div>
              <p class="mt-1 whitespace-pre-wrap rounded-2xl bg-[#f8fbfe] px-4 py-3">
                {{ selectedFeedback.content }}
              </p>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <p class="text-[#6e89a3]">页面标题</p>
                <p class="mt-1">{{ selectedFeedback.pageTitle || "暂无" }}</p>
              </div>
              <div>
                <p class="text-[#6e89a3]">页面路由</p>
                <p class="mt-1 break-all">{{ selectedFeedback.pageRoute || "暂无" }}</p>
              </div>
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[#6e89a3]">联系方式</p>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe] disabled:cursor-not-allowed disabled:border-[#d8edf9] disabled:text-[#9ab3c7] disabled:hover:bg-transparent"
                    :disabled="!selectedFeedback.contact?.trim()"
                    @click="
                      void copyFeedbackValue(
                        selectedFeedback.contact ?? '',
                        '已复制联系方式'
                      )
                    "
                  >
                    复制联系方式
                  </button>
                </div>
                <p class="mt-1">{{ selectedFeedback.contact || "未填写" }}</p>
              </div>
              <div>
                <p class="text-[#6e89a3]">用户 ID</p>
                <p class="mt-1">{{ selectedFeedback.userId }}</p>
              </div>
            </div>

            <div class="mt-6 border-t border-[#e1f5fe] pt-5 space-y-4">
              <div>
                <p class="text-[#6e89a3] mb-1">处理状态</p>
                <select
                  v-model="editingStatus"
                  class="rounded-xl border border-[#b3e5fc] bg-white px-3 py-2 text-sm text-[#355878] outline-none transition-colors focus:border-[#4fc3f7]"
                >
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <p class="text-[#6e89a3] mb-1">管理员备注</p>
                <textarea
                  v-model="editingAdminNote"
                  class="input-ai w-full min-h-[60px] text-sm"
                  placeholder="备注信息..."
                ></textarea>
              </div>
              <div>
                <button
                  type="button"
                  class="btn-primary text-sm"
                  :disabled="savingFeedback"
                  @click="handleSaveFeedback"
                >
                  {{ savingFeedback ? '保存中...' : '保存' }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div
        v-if="feedbackActionMessage"
        class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)]"
      >
        {{ feedbackActionMessage }}
      </div>
    </template>
  </div>
</template>
