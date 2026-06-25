<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  getSurvey,
  getSurveyStats,
  analyzeSurveyStats,
} from "../services/api";
import type { Survey, SurveyStats } from "../services/api";

const route = useRoute();
const surveyId = String(route.params.id);

const survey = ref<Survey | null>(null);
const stats = ref<SurveyStats | null>(null);
const loading = ref(true);
const error = ref("");

const analysis = ref("");
const analyzing = ref(false);

const load = async () => {
  try {
    const [s, st] = await Promise.all([
      getSurvey(surveyId),
      getSurveyStats(surveyId),
    ]);
    survey.value = s;
    stats.value = st;
  } catch {
    error.value = "加载失败";
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const doAnalyze = async () => {
  analyzing.value = true;
  try {
    const result = await analyzeSurveyStats(surveyId);
    analysis.value = result.summary;
  } catch {
    analysis.value = "AI 解读失败，请稍后重试";
  } finally {
    analyzing.value = false;
  }
};

const pct = (count: number, total: number) => {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
};
</script>

<template>
  <div class="survey-page">
    <div class="grid-overlay"></div>

    <div class="relative z-10 max-w-4xl mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
      </div>

      <div v-else-if="error" class="text-center py-20 text-red-400">{{ error }}</div>

      <template v-else-if="survey && stats">
        <h1 class="text-2xl font-bold text-slate-100 mb-2">{{ survey.title }}</h1>
        <p class="text-slate-400 text-sm mb-8">
          共回收 {{ stats.totalResponses }} 份答卷
        </p>

        <!-- AI Analysis -->
        <div class="glass-panel rounded-2xl border border-purple-500/20 p-5 mb-6">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-purple-300">🤖 AI 解读</h2>
            <button
              v-if="!analysis"
              @click="doAnalyze"
              :disabled="analyzing"
              class="px-4 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-300 text-xs hover:bg-purple-500/25 disabled:opacity-40 transition-all"
            >
              <span v-if="analyzing">解读中...</span>
              <span v-else>生成解读</span>
            </button>
          </div>
          <p v-if="analysis" class="text-slate-300 text-sm leading-relaxed">
            {{ analysis }}
          </p>
          <p v-else class="text-slate-500 text-xs">
            点击"生成解读"，AI 将根据回收数据生成文字摘要
          </p>
        </div>

        <!-- Per-question stats -->
        <div class="space-y-4">
          <div
            v-for="q in stats.questions"
            :key="q.questionId"
            class="glass-panel rounded-xl border border-slate-700/50 p-5"
          >
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-slate-200 font-medium text-sm">{{ q.questionTitle }}</h3>
              <span class="text-xs text-slate-500">
                {{ q.answeredCount }} / {{ q.visibleCount }} 人回答
                <span v-if="q.visibleCount < stats.totalResponses" class="text-amber-500/70 ml-1">
                  (可见 {{ q.visibleCount }})
                </span>
              </span>
            </div>

            <!-- Single/multi choice -->
            <div
              v-if="q.distribution"
              class="space-y-1.5"
            >
              <div
                v-for="(count, opt) in q.distribution"
                :key="opt"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-slate-400 w-24 truncate text-right">{{ opt }}</span>
                <div class="flex-1 h-5 bg-slate-800/60 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full bg-cyan-500/50 transition-all"
                    :style="{ width: pct(count, q.answeredCount) + '%' }"
                  ></div>
                </div>
                <span class="text-xs text-slate-400 w-12 text-right"
                  >{{ count }} <span class="text-slate-600">({{ pct(count, q.answeredCount) }}%)</span></span
                >
              </div>
            </div>

            <!-- Rating -->
            <div v-if="q.ratingDistribution" class="space-y-1.5">
              <p v-if="q.average !== undefined" class="text-xs text-slate-400 mb-2">
                平均分：<span class="text-yellow-400 font-semibold">{{ q.average }}</span> / 5
              </p>
              <div
                v-for="(count, star) in q.ratingDistribution"
                :key="star"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-yellow-500 w-10 text-right">{{ star }} ★</span>
                <div class="flex-1 h-5 bg-slate-800/60 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full bg-yellow-500/50 transition-all"
                    :style="{ width: pct(count, q.answeredCount) + '%' }"
                  ></div>
                </div>
                <span class="text-xs text-slate-400 w-10 text-right">{{ count }}</span>
              </div>
            </div>

            <!-- Text responses -->
            <div v-if="q.textResponses && q.textResponses.length > 0" class="space-y-1.5 max-h-60 overflow-y-auto">
              <div
                v-for="(t, ti) in q.textResponses"
                :key="ti"
                class="text-xs text-slate-400 py-1.5 px-3 rounded bg-slate-800/40"
              >
                {{ t }}
              </div>
            </div>
            <p
              v-if="q.type === 'text' && (!q.textResponses || q.textResponses.length === 0)"
              class="text-xs text-slate-500"
            >
              暂无回答
            </p>
          </div>
        </div>
      </template>
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
  background: linear-gradient(135deg, #0a1628 0%, #0f1f3d 50%, #0a1628 100%);
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(3, 169, 244, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(3, 169, 244, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.glass-panel {
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(16px);
}
</style>
