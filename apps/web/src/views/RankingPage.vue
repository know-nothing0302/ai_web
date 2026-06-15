<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Trophy, Star, Clock } from "lucide-vue-next";
import { getRanking, type RankingItem } from "../services/api";

const router = useRouter();
const items = ref<RankingItem[]>([]);
const loading = ref(false);
const pagination = ref({ page: 1, pageSize: 20, total: 0 });

const load = async (page = 1): Promise<void> => {
  loading.value = true;
  try {
    const result = await getRanking(page);
    items.value = result.items;
    pagination.value = result.pagination;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const goToArticle = (id: string): void => {
  router.push(`/articles/${id}`);
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
};

onMounted(() => {
  load();
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <button @click="router.back()" class="flex items-center gap-2 text-[#4f6b8a] hover:text-[#01579b] dark:text-[#cbd5e1] dark:hover:text-[#7dd3fc] transition-colors">
      <ArrowLeft class="w-4 h-4" />
      返回
    </button>

    <div class="flex items-center gap-3">
      <Trophy class="w-6 h-6 text-[#f59e0b]" />
      <h1 class="text-2xl font-bold text-[#0f4069] dark:text-[#e2e8f0]">排行榜</h1>
      <span class="text-sm text-[#8aa3bc] dark:text-slate-400">按收藏数降序</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-16">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0288d1] dark:border-[#38bdf8]"></div>
    </div>

    <div v-else-if="items.length === 0" class="glass-panel rounded-3xl p-12 text-center border shadow-sm">
      <Trophy class="w-12 h-12 mx-auto mb-4 text-[#b3e5fc] dark:text-slate-500" />
      <h3 class="text-lg font-medium text-[#4f6b8a] dark:text-[#cbd5e1]">暂无排行数据</h3>
      <p class="text-sm text-[#8aa3bc] dark:text-slate-400 mt-1">收藏文章后，排行将自动更新</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(item, idx) in items"
        :key="item.id"
        class="glass-panel rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        @click="goToArticle(item.id)"
      >
        <div class="flex items-start gap-4">
          <!-- Rank badge -->
          <div
            class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
            :class="{
              'bg-[#fef3c7] text-[#f59e0b] dark:bg-yellow-800/30 dark:text-yellow-400': idx >= 3,
              'bg-[#e1f5fe] text-[#0288d1] dark:bg-sky-900/40 dark:text-[#38bdf8]': idx < 3,
            }"
          >
            <template v-if="idx === 0">🥇</template>
            <template v-else-if="idx === 1">🥈</template>
            <template v-else-if="idx === 2">🥉</template>
            <template v-else>{{ idx + 1 }}</template>
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-[#0f4069] dark:text-[#e2e8f0] line-clamp-2">{{ item.title }}</h3>
            <p v-if="item.summary" class="text-sm text-[#6e89a3] dark:text-slate-400 line-clamp-2 mt-1">{{ item.summary }}</p>
            <div class="flex items-center gap-3 mt-3 text-xs text-[#8aa3bc] dark:text-slate-400">
              <span v-if="item.published_at" class="flex items-center gap-1">
                <Clock class="w-3 h-3" />
                {{ formatDate(item.published_at) }}
              </span>
              <span v-if="item.category" class="badge-ai !bg-[#e1f5fe] !text-[#0277bd] dark:!bg-slate-700/40 dark:!text-[#7dd3fc]">{{ item.category }}</span>
            </div>
          </div>

          <div class="shrink-0 flex items-center gap-1.5 text-[#f59e0b]">
            <Star class="w-4 h-4 fill-current" />
            <span class="text-sm font-semibold">{{ item.favorite_count }}</span>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > pagination.pageSize" class="flex items-center justify-center gap-2 pt-4">
        <button
          :disabled="pagination.page <= 1"
          class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 transition-colors"
          @click.stop="load(pagination.page - 1)"
        >
          上一页
        </button>
        <span class="text-sm text-[#8aa3bc] dark:text-slate-400">{{ pagination.page }} / {{ Math.ceil(pagination.total / pagination.pageSize) }}</span>
        <button
          :disabled="pagination.page >= Math.ceil(pagination.total / pagination.pageSize)"
          class="px-4 py-2 rounded-xl text-sm font-medium border border-[#b3e5fc] dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50 transition-colors"
          @click.stop="load(pagination.page + 1)"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
