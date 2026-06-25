<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { listSurveys } from "../services/api";
import type { Survey } from "../services/api";

const router = useRouter();
const surveys = ref<Survey[]>([]);
const loading = ref(true);
const error = ref("");

const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    const result = await listSurveys();
    surveys.value = result.items;
  } catch (e) {
    error.value = "加载失败";
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const statusLabel = (s: string) => {
  switch (s) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "closed":
      return "已关闭";
    default:
      return s;
  }
};

const statusClass = (s: string) => {
  switch (s) {
    case "draft":
      return "bg-slate-500/15 text-slate-500 border-slate-500/25";
    case "published":
      return "bg-green-500/15 text-green-400 border-green-500/25";
    case "closed":
      return "bg-red-500/15 text-red-400 border-red-500/25";
    default:
      return "";
  }
};

const goToCreate = () => router.push("/ai-lab/survey/create");
const goToDetail = (id: string) => router.push(`/ai-lab/survey/${id}`);
</script>

<template>
  <div class="survey-page">
    <div class="relative z-10 max-w-5xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-slate-800">智能问卷</h1>
          <p class="text-slate-500 mt-1">AI 生成 · 企微推送 · 数据统计</p>
        </div>
        <button
          @click="goToCreate"
          class="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-medium hover:bg-cyan-600 transition-all text-sm"
        >
          + 新建问卷
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-20 text-red-400">{{ error }}</div>

      <!-- Empty -->
      <div
        v-else-if="surveys.length === 0"
        class="text-center py-20"
      >
        <div class="text-5xl mb-4">📋</div>
        <p class="text-slate-500 mb-4">还没有问卷</p>
        <button
          @click="goToCreate"
          class="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-medium hover:bg-cyan-600 transition-all text-sm"
        >
          创建第一份问卷
        </button>
      </div>

      <!-- Grid -->
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <div
          v-for="s in surveys"
          :key="s.id"
          @click="goToDetail(s.id)"
          class="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:border-cyan-400 transition-all hover:translate-y-[-3px]"
        >
          <div class="flex items-start justify-between mb-3">
            <h3 class="font-semibold text-slate-700 text-sm flex-1 mr-3 line-clamp-2">
              {{ s.title }}
            </h3>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0"
              :class="statusClass(s.status)"
            >
              {{ statusLabel(s.status) }}
            </span>
          </div>
          <p
            v-if="s.description"
            class="text-slate-500 text-xs mb-3 line-clamp-2"
          >
            {{ s.description }}
          </p>
          <div class="flex items-center justify-between text-xs text-slate-500">
            <span>{{ s.questions.length }} 题</span>
            <span v-if="s.status !== 'draft'"
              >{{ s.responseCount ?? 0 }} 份回收</span
            >
            <span v-else>未发布</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.survey-page {
  position: relative;
  min-height: calc(100vh - 10rem);
  padding: 3rem 1.5rem;
  border-radius: 1.5rem;
  overflow: hidden;
  background: #f8fafc;
}

.glass-panel {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
