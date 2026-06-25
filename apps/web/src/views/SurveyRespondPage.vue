<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getSurvey, respondSurvey } from "../services/api";
import SurveyForm from "../components/SurveyForm.vue";
import type { SurveyQuestion } from "../services/api";
import axios from "axios";

const route = useRoute();
const token = String(route.params.token);

const questions = ref<SurveyQuestion[]>([]);
const title = ref("");
const description = ref("");
const loading = ref(true);
const error = ref("");
const submitted = ref(false);
const submitting = ref(false);

const answers = ref<Record<string, unknown>>({});

// CAS auth state
const currentUserId = ref("");
const authChecking = ref(true);

const checkAuth = async () => {
  try {
    const { data } = await axios.get("/api/auth/me");
    if (data.user?.id) {
      currentUserId.value = data.user.id;
    }
  } catch {
    // Not logged in — that's fine
  } finally {
    authChecking.value = false;
  }
};

const loginUrl = `/api/auth/cas/login?redirect=${encodeURIComponent("/s/" + token)}`;

onMounted(async () => {
  await Promise.all([
    checkAuth(),
    (async () => {
      try {
        const result = await getSurvey(token, token);
        title.value = result.title;
        description.value = result.description;
        questions.value = result.questions;
      } catch {
        error.value = "问卷不存在或已关闭";
      } finally {
        loading.value = false;
      }
    })(),
  ]);
});

const doSubmit = async () => {
  submitting.value = true;
  error.value = "";
  try {
    await respondSurvey(token, token, answers.value);
    submitted.value = true;
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.response?.data?.errors?.join(", ") || "提交失败";
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="respond-page">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-32">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error && !submitted" class="text-center py-20">
      <div class="text-5xl mb-4">😕</div>
      <p class="text-slate-500">{{ error }}</p>
    </div>

    <!-- Submitted -->
    <div v-else-if="submitted" class="text-center py-20">
      <div class="text-5xl mb-4">✅</div>
      <h2 class="text-xl font-semibold text-slate-800 mb-2">提交成功</h2>
      <p class="text-slate-500">感谢你的参与！</p>
    </div>

    <!-- Form -->
    <div v-else class="max-w-2xl mx-auto px-4 py-8">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-slate-800 mb-2">{{ title }}</h1>
        <p v-if="description" class="text-slate-500 text-sm">{{ description }}</p>
      </div>

      <!-- Auth status -->
      <div v-if="!authChecking" class="mb-6 p-3 rounded-lg border text-sm" :class="currentUserId ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'">
        <template v-if="currentUserId">
          ✅ 当前登录工号：<span class="font-mono font-medium">{{ currentUserId }}</span>（将自动记录）
        </template>
        <template v-else>
          未登录，提交将不记录工号。
          <a :href="loginUrl" class="text-cyan-600 underline hover:text-cyan-500 ml-1">登录以记录工号</a>
        </template>
      </div>

      <SurveyForm
        :questions="questions"
        mode="fill"
        v-model="answers"
      />

      <div
        v-if="error"
        class="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <button
        @click="doSubmit"
        :disabled="submitting"
        class="mt-8 w-full px-5 py-3 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-600 disabled:opacity-40 transition-all"
      >
        <span v-if="submitting">提交中...</span>
        <span v-else>提交问卷</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.respond-page {
  min-height: calc(100vh - 8rem);
  padding: 2rem 0;
  background: #f8fafc;
}
</style>
