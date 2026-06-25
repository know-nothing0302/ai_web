<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { generateSurvey, createSurvey } from "../services/api";
import SurveyForm from "../components/SurveyForm.vue";
import type { SurveyQuestion } from "../services/api";

const router = useRouter();

const description = ref("");
const generating = ref(false);
const saving = ref(false);
const error = ref("");

const generatedTitle = ref("");
const generatedDesc = ref("");
const questions = ref<SurveyQuestion[]>([]);

const doGenerate = async () => {
  if (!description.value.trim()) return;
  generating.value = true;
  error.value = "";
  try {
    const result = await generateSurvey(description.value.trim());
    generatedTitle.value = result.title;
    generatedDesc.value = result.description;
    questions.value = result.questions;
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || "生成失败，请重试";
  } finally {
    generating.value = false;
  }
};

const addQuestion = () => {
  const id = `q${questions.value.length + 1}`;
  questions.value.push({
    id,
    type: "single_choice",
    title: "",
    options: ["选项1", "选项2"],
    required: true,
  });
};

const removeQuestion = (index: number) => {
  questions.value.splice(index, 1);
  // Re-index
  questions.value = questions.value.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  // Update showIf references
  for (const q of questions.value) {
    if (q.showIf) {
      const oldIdx = parseInt(q.showIf.questionId.replace("q", ""));
      if (oldIdx > index + 1) {
        q.showIf.questionId = `q${oldIdx - 1}`;
      }
    }
  }
};

const addOption = (qIndex: number) => {
  const q = questions.value[qIndex];
  if (q && q.options) {
    q.options.push(`选项${q.options.length + 1}`);
  }
};

const removeOption = (qIndex: number, optIndex: number) => {
  const q = questions.value[qIndex];
  if (q && q.options && q.options.length > 2) {
    q.options.splice(optIndex, 1);
  }
};

const doSave = async () => {
  if (!generatedTitle.value.trim()) {
    error.value = "请输入标题";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const survey = await createSurvey({
      title: generatedTitle.value.trim(),
      description: generatedDesc.value.trim(),
      questions: questions.value,
    });
    router.push(`/ai-lab/survey/${survey.id}`);
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || "保存失败";
  } finally {
    saving.value = false;
  }
};

// Quick-setting toggles for a question
const setQuestionType = (q: SurveyQuestion, type: SurveyQuestion["type"]) => {
  q.type = type;
  if (type === "single_choice" || type === "multiple_choice") {
    if (!q.options || q.options.length === 0) {
      q.options = ["选项1", "选项2"];
    }
  }
};
</script>

<template>
  <div class="survey-page">
    <div class="grid-overlay"></div>

    <div class="relative z-10 max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold text-slate-100 mb-8">创建问卷</h1>

      <!-- Step 1: Describe -->
      <div v-if="questions.length === 0" class="glass-panel rounded-2xl border border-slate-700/50 p-6">
        <label class="block text-slate-300 font-medium mb-3 text-sm"
          >描述你的问卷需求</label
        >
        <textarea
          v-model="description"
          rows="3"
          placeholder="例如：对临床医学专业 2024 级学生的科研意愿调查，包括参与科研的频率、感兴趣的领域、遇到的困难..."
          class="w-full px-4 py-3 bg-slate-900/60 border border-slate-600/40 rounded-xl text-slate-200 text-sm placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none resize-y mb-4"
          @keydown.enter.ctrl="doGenerate"
        ></textarea>
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">
            描述你想要什么问卷，AI 会生成题目。生成后你可以编辑。
          </p>
          <button
            @click="doGenerate"
            :disabled="!description.trim() || generating"
            class="px-5 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 font-medium hover:bg-cyan-500/30 disabled:opacity-40 transition-all text-sm"
          >
            <span v-if="generating" class="inline-flex items-center gap-2">
              <span class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-cyan-300"></span>
              生成中...
            </span>
            <span v-else>🤖 AI 生成</span>
          </button>
        </div>

        <div v-if="error" class="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          {{ error }}
        </div>
      </div>

      <!-- Step 2: Edit generated survey -->
      <div v-else class="space-y-6">
        <div class="glass-panel rounded-2xl border border-slate-700/50 p-6">
          <label class="block text-slate-300 font-medium mb-2 text-sm">问卷标题</label>
          <input
            v-model="generatedTitle"
            class="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-600/40 rounded-xl text-slate-200 text-sm focus:border-cyan-500/60 focus:outline-none mb-4"
          />

          <label class="block text-slate-300 font-medium mb-2 text-sm">问卷说明</label>
          <input
            v-model="generatedDesc"
            class="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-600/40 rounded-xl text-slate-200 text-sm focus:border-cyan-500/60 focus:outline-none"
          />
        </div>

        <!-- Questions editor -->
        <div class="glass-panel rounded-2xl border border-slate-700/50 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-slate-200 font-semibold text-sm">题目列表（{{ questions.length }} 题）</h2>
            <button
              @click="addQuestion"
              class="text-xs px-3 py-1.5 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-600/40 transition-colors"
            >
              + 添加题目
            </button>
          </div>

          <div class="space-y-4">
            <div
              v-for="(q, qi) in questions"
              :key="qi"
              class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40"
            >
              <div class="flex items-start gap-3 mb-3">
                <span class="text-xs text-slate-500 mt-2 shrink-0">{{ q.id }}</span>
                <input
                  v-model="q.title"
                  class="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-slate-200 text-sm focus:border-cyan-500/60 focus:outline-none"
                  placeholder="题目"
                />
                <select
                  @change="setQuestionType(q, ($event.target as HTMLSelectElement).value as any)"
                  class="px-2 py-2 bg-slate-900/60 border border-slate-600/40 rounded-lg text-slate-300 text-xs focus:border-cyan-500/60 focus:outline-none"
                >
                  <option value="single_choice" :selected="q.type === 'single_choice'">单选</option>
                  <option value="multiple_choice" :selected="q.type === 'multiple_choice'">多选</option>
                  <option value="text" :selected="q.type === 'text'">文本</option>
                  <option value="rating" :selected="q.type === 'rating'">评分</option>
                </select>
                <label class="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                  <input type="checkbox" v-model="q.required" class="accent-cyan-500" />
                  必填
                </label>
                <button
                  @click="removeQuestion(qi)"
                  class="text-xs text-slate-500 hover:text-red-400 shrink-0"
                >
                  ✕
                </button>
              </div>

              <!-- Options editor -->
              <div
                v-if="q.type === 'single_choice' || q.type === 'multiple_choice'"
                class="ml-8 space-y-1.5"
              >
                <div
                  v-for="(_opt, oi) in q.options"
                  :key="oi"
                  class="flex items-center gap-2"
                >
                  <span class="text-xs text-slate-600 w-4">{{
                    q.type === "single_choice" ? "○" : "☐"
                  }}</span>
                  <input
                    v-model="q.options![oi]"
                    class="flex-1 px-2 py-1.5 bg-slate-900/60 border border-slate-600/40 rounded-lg text-slate-300 text-xs focus:border-cyan-500/60 focus:outline-none"
                    placeholder="选项文字"
                  />
                  <button
                    v-if="q.options && q.options.length > 2"
                    @click="removeOption(qi, oi)"
                    class="text-xs text-slate-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                <button
                  @click="addOption(qi)"
                  v-if="q.options && q.options.length < 8"
                  class="text-xs text-cyan-400 hover:text-cyan-300 ml-6"
                >
                  + 添加选项
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div class="glass-panel rounded-2xl border border-slate-700/50 p-6">
          <h2 class="text-slate-200 font-semibold text-sm mb-4">预览</h2>
          <SurveyForm :questions="questions" :editable="false" />
        </div>

        <div v-if="error" class="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          {{ error }}
        </div>

        <div class="flex gap-3">
          <button
            @click="doSave"
            :disabled="saving"
            class="flex-1 px-5 py-3 rounded-xl bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 font-semibold hover:bg-cyan-500/35 disabled:opacity-40 transition-all"
          >
            <span v-if="saving">保存中...</span>
            <span v-else>💾 保存草稿</span>
          </button>
          <button
            @click="questions = []"
            class="px-5 py-3 rounded-xl bg-slate-700/30 border border-slate-600/40 text-slate-400 hover:text-slate-300 transition-all text-sm"
          >
            重新生成
          </button>
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
