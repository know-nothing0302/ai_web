<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import QRCode from "qrcode";
import {
  getSurvey,
  publishSurvey,
  closeSurvey,
  reopenSurvey,
  copySurvey,
  deleteSurvey,
} from "../services/api";
import SurveyForm from "../components/SurveyForm.vue";
import WecomOrgPicker from "../components/WecomOrgPicker.vue";
import SurveyNavSidebar from "../components/SurveyNavSidebar.vue";
import type { Survey, SurveyRecipientConfig } from "../services/api";

const route = useRoute();
const router = useRouter();
const survey = ref<Survey | null>(null);
const loading = ref(true);
const error = ref("");

const showPublishPanel = ref(false);
const publishMode = ref<"link-only" | "with-recipients" | "">("");
const publishing = ref(false);
const recipientConfig = ref<SurveyRecipientConfig>({
  department_ids: [],
  user_ids: [],
  department_names: [],
  user_names: [],
  tag_ids: [],
  tag_names: [],
});
const qrCanvas = ref<HTMLCanvasElement | null>(null);
const showRepushPanel = ref(false);

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

const renderQRCode = async (url: string) => {
  await nextTick();
  if (qrCanvas.value) {
    await QRCode.toCanvas(qrCanvas.value, url, { width: 160, margin: 1 });
  }
};

const doPublish = async () => {
  if (!survey.value) return;
  publishing.value = true;
  try {
    const config =
      publishMode.value === "link-only"
        ? { department_ids: [], user_ids: [], department_names: [], user_names: [], tag_ids: [], tag_names: [] }
        : recipientConfig.value;
    const result = await publishSurvey(survey.value.id, config);
    survey.value = result;
    showPublishPanel.value = false;
    publishMode.value = "";
    // Render QR code after publish
    if (result.shareUrl) {
      await renderQRCode(result.shareUrl);
    }
  } catch (e: any) {
    error.value = e?.response?.data?.message || "发布失败";
  } finally {
    publishing.value = false;
  }
};

const doRepush = async () => {
  if (!survey.value) return;
  publishing.value = true;
  try {
    const result = await reopenSurvey(survey.value.id, recipientConfig.value);
    survey.value = result;
    showRepushPanel.value = false;
  } catch (e: any) {
    error.value = e?.response?.data?.message || "重新推送失败";
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

const doReopen = async () => {
  if (!survey.value) return;
  try {
    const result = await reopenSurvey(survey.value.id);
    survey.value = result;
  } catch (e: any) {
    error.value = e?.response?.data?.message || "重开失败";
  }
};

const doCopy = async () => {
  if (!survey.value) return;
  try {
    const copy = await copySurvey(survey.value.id);
    router.push(`/ai-lab/survey/${copy.id}`);
  } catch (e: any) {
    error.value = e?.response?.data?.message || "复制失败";
  }
};

const doDelete = async () => {
  if (!survey.value) return;
  if (!confirm("确定删除这份问卷吗？删除后无法恢复。")) return;
  try {
    await deleteSurvey(survey.value.id);
    router.push("/ai-lab/survey");
  } catch (e: any) {
    error.value = e?.response?.data?.message || "删除失败";
  }
};

const copyLink = () => {
  if (!survey.value?.publishToken) return;
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const url = `${window.location.origin}${base}/s/${survey.value.publishToken}`;
  navigator.clipboard.writeText(url).then(() => {
    // Brief feedback
  });
};

const goToStats = () => {
  if (survey.value) {
    router.push(`/ai-lab/survey/${survey.value.id}/stats`);
  }
};

const goToEdit = () => {
  if (survey.value) {
    router.push(`/ai-lab/survey/create?edit=${survey.value.id}`);
  }
};

const shareUrl = computed(() => {
  if (!survey.value?.publishToken) return "";
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${window.location.origin}${base}/s/${survey.value.publishToken}`;
});

// Watch for share URL to render QR code
watch(shareUrl, (url) => {
  if (url) renderQRCode(url);
});

const openRepushPanel = () => {
  // Pre-fill with current recipient config
  if (survey.value?.recipientConfig) {
    recipientConfig.value = {
      department_ids: survey.value.recipientConfig.department_ids ?? [],
      user_ids: survey.value.recipientConfig.user_ids ?? [],
      department_names: survey.value.recipientConfig.department_names ?? [],
      user_names: survey.value.recipientConfig.user_names ?? [],
      tag_ids: survey.value.recipientConfig.tag_ids ?? [],
      tag_names: survey.value.recipientConfig.tag_names ?? [],
    };
  }
  showRepushPanel.value = true;
};
</script>

<template>
  <div class="survey-page">
    <SurveyNavSidebar v-if="survey" :survey-id="survey.id" />
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
              'bg-slate-500/15 text-slate-500 border-slate-500/25': survey.status === 'draft',
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
          <!-- Draft: edit + publish + delete -->
          <template v-if="survey.status === 'draft'">
            <button
              @click="goToEdit"
              class="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm hover:bg-slate-200 transition-all"
            >
              ✏️ 编辑
            </button>
            <button
              @click="showPublishPanel = true"
              class="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition-all"
            >
              🚀 发布问卷
            </button>
            <button
              @click="doDelete"
              class="px-4 py-2 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm hover:bg-red-200 transition-all"
            >
              🗑 删除
            </button>
          </template>

          <!-- Published: copy link + stats + repush + close + copy + delete -->
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
              @click="openRepushPanel"
              class="px-4 py-2 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-all"
            >
              📨 重新推送
            </button>
            <button
              @click="doClose"
              class="px-4 py-2 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm hover:bg-red-200 transition-all"
            >
              ⏹ 关闭回收
            </button>
            <button
              @click="doCopy"
              class="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm hover:bg-slate-200 transition-all"
            >
              📋 复制问卷
            </button>
            <button
              @click="doDelete"
              class="px-4 py-2 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm hover:bg-red-200 transition-all"
            >
              🗑 删除
            </button>
          </template>

          <!-- Closed: reopen + stats + copy + delete -->
          <template v-if="survey.status === 'closed'">
            <button
              @click="doReopen"
              class="px-4 py-2 rounded-lg bg-green-100 border border-green-200 text-green-600 text-sm font-medium hover:bg-green-200 transition-all"
            >
              🔄 重新开启
            </button>
            <button
              @click="goToStats"
              class="px-4 py-2 rounded-lg bg-purple-100 border border-purple-200 text-purple-600 text-sm font-medium hover:bg-purple-200 transition-all"
            >
              📊 查看统计
            </button>
            <button
              @click="doCopy"
              class="px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm hover:bg-slate-200 transition-all"
            >
              📋 复制问卷
            </button>
            <button
              @click="doDelete"
              class="px-4 py-2 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm hover:bg-red-200 transition-all"
            >
              🗑 删除
            </button>
          </template>
        </div>

        <!-- Publish panel -->
        <div
          v-if="showPublishPanel"
          class="glass-panel rounded-2xl border border-cyan-500/30 p-6 mb-6"
        >
          <!-- Step 1: Choose publish mode -->
          <template v-if="!publishMode">
            <h2 class="text-slate-700 font-semibold text-sm mb-4">选择发布方式</h2>
            <div class="flex gap-3">
              <button
                @click="publishMode = 'link-only'"
                class="flex-1 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-sm text-center"
              >
                <div class="text-2xl mb-1">🔗</div>
                <div class="font-medium">仅生成链接</div>
                <div class="text-xs text-slate-500 mt-1">生成分享链接和二维码，不推送通知</div>
              </button>
              <button
                @click="publishMode = 'with-recipients'"
                class="flex-1 px-4 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all text-sm text-center"
              >
                <div class="text-2xl mb-1">📨</div>
                <div class="font-medium">选择发布对象</div>
                <div class="text-xs text-slate-500 mt-1">选择部门/人员/标签，通过企微推送通知</div>
              </button>
            </div>
            <button
              @click="showPublishPanel = false"
              class="mt-3 w-full px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-700 transition-all text-sm"
            >
              取消
            </button>
          </template>

          <!-- Step 2a: Link-only confirmation -->
          <template v-if="publishMode === 'link-only'">
            <h2 class="text-slate-700 font-semibold text-sm mb-3">确认发布（仅生成链接）</h2>
            <p class="text-slate-500 text-xs mb-4">发布后将生成分享链接和二维码，不会向任何人推送通知。</p>
            <div class="flex gap-3">
              <button
                @click="doPublish"
                :disabled="publishing"
                class="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-600 disabled:opacity-40 transition-all text-sm"
              >
                <span v-if="publishing">发布中...</span>
                <span v-else>确认发布</span>
              </button>
              <button
                @click="publishMode = ''"
                class="px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-700 transition-all text-sm"
              >
                返回
              </button>
            </div>
          </template>

          <!-- Step 2b: With recipients -->
          <template v-if="publishMode === 'with-recipients'">
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
                @click="publishMode = ''"
                class="px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-700 transition-all text-sm"
              >
                返回
              </button>
            </div>
          </template>
        </div>

        <!-- Repush panel -->
        <div
          v-if="showRepushPanel"
          class="glass-panel rounded-2xl border border-amber-500/30 p-6 mb-6"
        >
          <h2 class="text-slate-700 font-semibold text-sm mb-4">重新选择发布对象并推送</h2>
          <WecomOrgPicker v-model="recipientConfig" />
          <div class="flex gap-3 mt-6">
            <button
              @click="doRepush"
              :disabled="publishing"
              class="px-5 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-40 transition-all text-sm"
            >
              <span v-if="publishing">推送中...</span>
              <span v-else>确认推送</span>
            </button>
            <button
              @click="showRepushPanel = false"
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
          <p class="text-xs text-slate-500 mb-3">分享链接（也可直接发给目标用户）：</p>
          <div class="flex items-start gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <code class="flex-1 px-3 py-2 rounded-lg bg-slate-50 text-cyan-700 text-xs break-all">
                  {{ shareUrl }}
                </code>
                <button
                  @click="copyLink"
                  class="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200 shrink-0"
                >
                  复制
                </button>
              </div>
            </div>
            <div class="shrink-0">
              <canvas ref="qrCanvas" class="rounded-lg border border-slate-200 w-24 h-24"></canvas>
            </div>
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
