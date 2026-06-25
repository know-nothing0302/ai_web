<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getSurvey,
  publishSurvey,
  closeSurvey,
} from "../services/api";
import SurveyForm from "../components/SurveyForm.vue";
import WecomOrgPicker from "../components/WecomOrgPicker.vue";
import type { Survey, SurveyRecipientConfig } from "../services/api";

const route = useRoute();
const router = useRouter();
const survey = ref<Survey | null>(null);
const loading = ref(true);
const error = ref("");

const showPublishPanel = ref(false);
const publishing = ref(false);
const recipientConfig = ref<SurveyRecipientConfig>({
  department_ids: [],
  user_ids: [],
  department_names: [],
  user_names: [],
});

const load = async () => {
  try {
    survey.value = await getSurvey(String(route.params.id));
  } catch {
    error.value = "问卷不存在";
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const doPublish = async () => {
  if (!survey.value) return;
  publishing.value = true;
  try {
    const result = await publishSurvey(survey.value.id, recipientConfig.value);
    survey.value = result;
    showPublishPanel.value = false;
  } catch (e: any) {
    error.value = e?.response?.data?.message || "发布失败";
  } finally {
    publishing.value = false;
  }
};

const doClose = async () => {
  if (!survey.value) return;
  try {
    const result = await closeSurvey(survey.value.id);
    survey.value = result;
  } catch (e: any) {
    error.value = e?.response?.data?.message || "关闭失败";
  }
};

const copyLink = () => {
  if (!survey.value?.publishToken) return;
  const url = `${window.location.origin}/s/${survey.value.publishToken}`;
  navigator.clipboard.writeText(url).then(() => {
    // Brief feedback
  });
};

const goToStats = () => {
  if (survey.value) {
    router.push(`/ai-lab/survey/${survey.value.id}/stats`);
  }
};

const shareUrl = computed(() => {
  if (!survey.value?.publishToken) return "";
  return `${location.origin}/s/${survey.value.publishToken}`;
});
</script>

<template>
  <div class="survey-page">
    <div class="relative z-10 max-w-3xl mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error && !survey" class="text-center py-20 text-red-400">
        {{ error }}
      </div>

      <template v-else-if="survey">
        <!-- Header -->
        <div class="flex items-start justify-between mb-6">
          <div class="flex-1 mr-4">
            <h1 class="text-2xl font-bold text-slate-800">{{ survey.title }}</h1>
            <p v-if="survey.description" class="text-slate-500 text-sm mt-1">
              {{ survey.description }}
            </p>
          </div>
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shrink-0"
            :class="{
              'bg-slate-500/15 text-slate-400 border-slate-500/25': survey.status === 'draft',
              'bg-green-500/15 text-green-400 border-green-500/25': survey.status === 'published',
              'bg-red-500/15 text-red-400 border-red-500/25': survey.status === 'closed',
            }"
          >
            {{ survey.status === 'draft' ? '草稿' : survey.status === 'published' ? '已发布' : '已关闭' }}
          </span>
        </div>

        <!-- Error -->
        <div
          v-if="error"
          class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm"
        >
          {{ error }}
          <button @click="error = ''" class="ml-2 hover:text-red-300">&times;</button>
        </div>

        <!-- Action bar -->
        <div class="flex flex-wrap gap-2 mb-6">
          <!-- Draft: publish button -->
          <button
            v-if="survey.status === 'draft'"
            @click="showPublishPanel = true"
            class="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition-all"
          >
            🚀 发布问卷
          </button>

          <!-- Published: copy link + stats + close -->
          <template v-if="survey.status === 'published'">
            <button
              @click="copyLink"
              class="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm hover:bg-slate-200 transition-all"
            >
              📋 复制链接
            </button>
            <button
              @click="goToStats"
              class="px-4 py-2 rounded-lg bg-purple-100 border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-200 transition-all"
            >
              📊 查看统计
            </button>
            <button
              @click="doClose"
              class="px-4 py-2 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm hover:bg-red-200 transition-all"
            >
              ⏹ 关闭回收
            </button>
          </template>

          <!-- Closed: stats -->
          <button
            v-if="survey.status === 'closed'"
            @click="goToStats"
            class="px-4 py-2 rounded-lg bg-purple-100 border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-200 transition-all"
          >
            📊 查看统计
          </button>
        </div>

        <!-- Publish panel -->
        <div
          v-if="showPublishPanel"
          class="glass-panel rounded-2xl border border-cyan-500/30 p-6 mb-6"
        >
          <h2 class="text-slate-700 font-semibold text-sm mb-4">选择发布对象</h2>
          <WecomOrgPicker v-model="recipientConfig" />
          <div class="flex gap-3 mt-6">
            <button
              @click="doPublish"
              :disabled="publishing"
              class="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-600 disabled:opacity-40 transition-all text-sm"
            >
              <span v-if="publishing">发布中...</span>
              <span v-else>确认发布并推送</span>
            </button>
            <button
              @click="showPublishPanel = false"
              class="px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-700 transition-all text-sm"
            >
              取消
            </button>
          </div>
        </div>

        <!-- Published share URL -->
        <div
          v-if="survey.status === 'published' && survey.publishToken"
          class="glass-panel rounded-2xl border border-green-500/20 p-4 mb-6"
        >
          <p class="text-xs text-slate-500 mb-2">分享链接（也可直接发给目标用户）：</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 px-3 py-2 rounded-lg bg-slate-50 text-cyan-700 text-xs break-all">
              {{ shareUrl }}
            </code>
            <button
              @click="copyLink"
              class="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200"
            >
              复制
            </button>
          </div>
        </div>

        <!-- Questions preview -->
        <div class="glass-panel rounded-2xl border border-slate-200 p-6">
          <h2 class="text-slate-700 font-semibold text-sm mb-4">
            问卷内容（{{ survey.questions.length }} 题）
          </h2>
          <SurveyForm :questions="survey.questions" mode="preview" />
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
  background: #f8fafc;
}

.glass-panel {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
</style>
