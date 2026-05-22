<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { ArrowLeft, BellRing, CalendarDays, Clock3, FileText } from "lucide-vue-next";
import {
  listTodayPushedArticles,
  type TodayPushedArticleItem,
} from "../services/api";
import { sanitizeCardText } from "../shared/text_sanitizer";

const router = useRouter();
const loading = ref(false);
const digestDate = ref("");
const items = ref<TodayPushedArticleItem[]>([]);
const errorMessage = ref("");

const formatTime = (isoString?: string): string => {
  if (!isoString) {
    return "--:--";
  }
  return new Date(isoString).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const articleCountLabel = computed(() => `${items.value.length} 条资讯`);
const getCardText = (value?: string): string => sanitizeCardText(value);

const load = async (): Promise<void> => {
  console.info("[TodayPushDigestPage] 加载今日推送聚合页");
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await listTodayPushedArticles();
    digestDate.value = result.date;
    items.value = result.items;
    console.info("[TodayPushDigestPage] 加载完成", {
      date: result.date,
      count: result.total,
    });
  } catch (error) {
    console.error("[TodayPushDigestPage] 加载失败", error);
    items.value = [];
    errorMessage.value = "聚合页面加载失败，请稍后刷新重试。";
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <button
      @click="router.push('/')"
      class="flex items-center gap-2 text-[#4f6b8a] hover:text-[#01579b] transition-colors"
    >
      <ArrowLeft class="w-4 h-4" />
      返回列表
    </button>

    <section class="glass-panel rounded-3xl p-6 md:p-8 border">
      <div class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="space-y-3">
          <p
            class="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-[#0277bd] bg-[#e1f5fe] border border-[#81d4fa]/70 rounded-full px-3 py-1"
          >
            <BellRing class="w-3.5 h-3.5" />
            今日推送聚合页
          </p>
          <h1 class="section-title">点击查看详情</h1>
          <p class="section-subtitle">
            展示当前登录用户今日收到的资讯推送列表，点击任意一条即可进入文章详情页。
          </p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="glass-card p-4 border-[#81d4fa]/40 min-w-[180px]">
            <div class="flex items-center gap-2 text-xs text-[#4f6b8a]">
              <CalendarDays class="w-4 h-4 text-[#0288d1]" />
              推送日期
            </div>
            <div class="mt-2 text-sm font-semibold text-[#01579b]">
              {{ digestDate || "今日" }}
            </div>
          </div>
          <div class="glass-card p-4 border-[#81d4fa]/40 min-w-[180px]">
            <div class="flex items-center gap-2 text-xs text-[#4f6b8a]">
              <FileText class="w-4 h-4 text-[#0288d1]" />
              资讯数量
            </div>
            <div class="mt-2 text-sm font-semibold text-[#01579b]">
              {{ articleCountLabel }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="loading" class="glass-card py-20 text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0288d1] mx-auto"></div>
    </section>

    <section v-else-if="errorMessage" class="glass-card py-20 text-center">
      <BellRing class="w-12 h-12 text-[#ffb74d] mx-auto mb-4" />
      <h2 class="text-xl font-medium text-[#01579b]">聚合页面加载失败</h2>
      <p class="text-[#4f6b8a] mt-2">{{ errorMessage }}</p>
    </section>

    <section v-else-if="items.length === 0" class="glass-card py-20 text-center">
      <BellRing class="w-12 h-12 text-[#4fc3f7] mx-auto mb-4" />
      <h2 class="text-xl font-medium text-[#01579b]">今日暂无推送记录</h2>
      <p class="text-[#4f6b8a] mt-2">今日推送成功后，这里会自动展示已发送给当前用户的资讯列表。</p>
    </section>

    <section v-else class="space-y-4">
      <RouterLink
        v-for="item in items"
        :key="`${item.pushRecordId}-${item.article.id}`"
        :to="`/articles/${item.article.id}`"
        class="glass-card p-5 block group"
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-3 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge-ai">{{ item.article.category }}</span>
              <span class="text-xs text-[#4f6b8a]">{{ item.article.channelName || item.article.channelCode }}</span>
            </div>
            <h2
              class="text-xl font-semibold text-[#0f4069] group-hover:text-[#01579b] transition-colors line-clamp-2"
            >
              {{ getCardText(item.article.title) }}
            </h2>
            <p class="text-sm text-[#4f6b8a] leading-relaxed line-clamp-3">
              {{ getCardText(item.article.summary) }}
            </p>
          </div>
          <div class="shrink-0 md:text-right">
            <div class="inline-flex items-center gap-1 text-xs text-[#4f6b8a]">
              <Clock3 class="w-3.5 h-3.5 text-[#0288d1]" />
              推送时间 {{ formatTime(item.sentAt) }}
            </div>
            <div class="mt-3 text-sm font-medium text-[#0288d1] group-hover:text-[#01579b]">
              进入详情
            </div>
          </div>
        </div>
      </RouterLink>
    </section>
  </div>
</template>
