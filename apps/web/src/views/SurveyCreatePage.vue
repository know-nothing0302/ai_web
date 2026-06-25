<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { generateSurvey, createSurvey, updateSurvey, getSurvey, editQuestions } from "../services/api";
import SurveyForm from "../components/SurveyForm.vue";
import type { SurveyQuestion } from "../services/api";

const router = useRouter();
const route = useRoute();

const description = ref("");
const generating = ref(false);
const saving = ref(false);
const error = ref("");
const saveStatus = ref(""); // "saved" | "saving" | ""

const generatedTitle = ref("");
const generatedDesc = ref("");
const questions = ref<SurveyQuestion[]>([]);

// For auto-save: store the survey ID once created
const surveyId = ref("");

// Auto-save timer
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

const startAutoSave = () => {
  if (autoSaveTimer) return;
  autoSaveTimer = setInterval(doAutoSave, 30_000);
};

const stopAutoSave = () => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
};

const doAutoSave = async () => {
  if (!surveyId.value || !generatedTitle.value.trim()) return;
  saveStatus.value = "saving";
  try {
    await updateSurvey(surveyId.value, {
      title: generatedTitle.value.trim(),
      description: generatedDesc.value.trim(),
      questions: questions.value,
    });
    saveStatus.value = "saved";
    setTimeout(() => { if (saveStatus.value === "saved") saveStatus.value = ""; }, 2000);
  } catch (e: any) {
    saveStatus.value = "";
    error.value = e?.response?.data?.detail || e?.message || "自动保存失败";
  }
};

// Watch for changes to show "unsaved" indicator (simplified: just clear saved status)
watch([generatedTitle, generatedDesc, questions], () => {
  if (surveyId.value && saveStatus.value === "saved") {
    saveStatus.value = "";
  }
}, { deep: true });

// Load existing survey for editing
onMounted(async () => {
  const editId = route.query.edit as string;
  if (editId) {
    try {
      const s = await getSurvey(editId);
      if (s.status === "draft" && s.isCreator) {
        surveyId.value = s.id;
        generatedTitle.value = s.title;
        generatedDesc.value = s.description;
        questions.value = s.questions;
        startAutoSave();
      }
    } catch {
      error.value = "问卷不存在";
    }
  }
});

onBeforeUnmount(() => {
  stopAutoSave();
});

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

const addQuestionAt = (index: number) => {
  const newId = `q${questions.value.length + 1}`;
  const newQ: SurveyQuestion = {
    id: newId,
    type: "single_choice",
    title: "",
    options: ["选项1", "选项2"],
    required: true,
  };
  questions.value.splice(index, 0, newQ);
  // Re-index
  questions.value = questions.value.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  // Update showIf references
  for (const q of questions.value) {
    if (q.showIf) {
      const oldNum = parseInt(q.showIf.questionId.replace("q", ""));
      if (oldNum > index) {
        q.showIf.questionId = `q${oldNum + 1}`;
      }
    }
  }
};

const removeQuestion = (index: number) => {
  const deletedId = questions.value[index]?.id;
  questions.value.splice(index, 1);
  // Re-index
  questions.value = questions.value.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  // Update showIf references: remove orphaned refs, shift refs pointing to questions after deleted
  for (const q of questions.value) {
    if (q.showIf) {
      // If the reference points to the deleted question, remove the condition
      if (q.showIf.questionId === deletedId) {
        q.showIf = undefined;
        continue;
      }
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
    if (surveyId.value) {
      // Update existing draft
      await updateSurvey(surveyId.value, {
        title: generatedTitle.value.trim(),
        description: generatedDesc.value.trim(),
        questions: questions.value,
      });
      stopAutoSave();
      router.push(`/ai-lab/survey/${surveyId.value}`);
    } else {
      // First save: create draft, then start auto-save
      const survey = await createSurvey({
        title: generatedTitle.value.trim(),
        description: generatedDesc.value.trim(),
        questions: questions.value,
      });
      surveyId.value = survey.id;
      startAutoSave();
      router.push(`/ai-lab/survey/${survey.id}`);
    }
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || "保存失败";
  } finally {
    saving.value = false;
  }
};

const editingInstruction = ref("");
const editingProcessing = ref(false);

const doEditQuestions = async () => {
  if (!editingInstruction.value.trim()) return;
  editingProcessing.value = true;
  error.value = "";
  try {
    const result = await editQuestions(questions.value, editingInstruction.value.trim());
    questions.value = result.questions;
    editingInstruction.value = "";
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || "修改失败，请重试";
  } finally {
    editingProcessing.value = false;
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
    <div class="relative z-10 max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold text-slate-800 mb-8">
        {{ surveyId ? "编辑问卷" : "创建问卷" }}
      </h1>

      <!-- Step 1: Describe (only for new surveys) -->
      <div v-if="questions.length === 0 && !surveyId" class="glass-panel rounded-2xl border border-slate-200 p-6">
        <label class="block text-slate-700 font-medium mb-3 text-sm"
          >描述你的问卷需求</label
        >
        <textarea
          v-model="description"
          rows="3"
          placeholder="例如：对临床医学专业 2024 级学生的科研意愿调查，包括参与科研的频率、感兴趣的领域、遇到的困难..."
          class="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none resize-y mb-4"
          @keydown.enter.ctrl="doGenerate"
        ></textarea>
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">
            描述你想要什么问卷，AI 会生成题目。生成后你可以编辑。
          </p>
          <button
            @click="doGenerate"
            :disabled="!description.trim() || generating"
            class="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-medium hover:bg-cyan-600 disabled:opacity-40 transition-all text-sm"
          >
            <span v-if="generating" class="inline-flex items-center gap-2">
              <span class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
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
        <div class="glass-panel rounded-2xl border border-slate-200 p-6">
          <label class="block text-slate-700 font-medium mb-2 text-sm">问卷标题</label>
          <input
            v-model="generatedTitle"
            class="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:border-cyan-500/60 focus:outline-none mb-4"
          />

          <label class="block text-slate-700 font-medium mb-2 text-sm">问卷说明</label>
          <input
            v-model="generatedDesc"
            class="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:border-cyan-500/60 focus:outline-none"
          />
        </div>

        <!-- Questions editor -->
        <div class="glass-panel rounded-2xl border border-slate-200 p-6">
          <h2 class="text-slate-700 font-semibold text-sm mb-4">题目列表（{{ questions.length }} 题）</h2>

          <div class="space-y-4">
            <!-- Insert zone before first question -->
            <div
              class="flex items-center justify-center cursor-pointer h-1 group hover:h-8 hover:bg-cyan-500/5 rounded transition-all duration-150"
              @click="addQuestionAt(0)"
            >
              <div class="w-full border-t border-dashed border-slate-300/40 group-hover:border-cyan-400/50 transition-colors"></div>
              <button
                class="hidden group-hover:inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-600 text-xs font-medium hover:bg-cyan-500/20 shrink-0 mx-2"
              >
                +
              </button>
              <div class="w-full border-t border-dashed border-slate-300/40 group-hover:border-cyan-400/50 transition-colors"></div>
            </div>

            <template v-for="(q, qi) in questions" :key="qi">
              <div class="p-4 rounded-xl bg-white border border-slate-200">
                <div class="flex items-start gap-3 mb-3">
                  <span class="text-xs text-slate-400 mt-2 shrink-0">{{ q.id }}</span>
                  <input
                    v-model="q.title"
                    class="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm focus:border-cyan-500/60 focus:outline-none"
                    placeholder="题目"
                  />
                  <select
                    @change="setQuestionType(q, ($event.target as HTMLSelectElement).value as any)"
                    class="px-2 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs focus:border-cyan-500/60 focus:outline-none"
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
                    <span class="text-xs text-slate-400 w-4">{{
                      q.type === "single_choice" ? "○" : "☐"
                    }}</span>
                    <input
                      v-model="q.options![oi]"
                      class="flex-1 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs focus:border-cyan-500/60 focus:outline-none"
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
                    class="text-xs text-cyan-600 hover:text-cyan-500 ml-6"
                  >
                    + 添加选项
                  </button>
                </div>
              </div>

              <!-- Insert zone after this question -->
              <div
                class="flex items-center justify-center cursor-pointer h-1 group hover:h-8 hover:bg-cyan-500/5 rounded transition-all duration-150"
                @click="addQuestionAt(qi + 1)"
              >
                <div class="w-full border-t border-dashed border-slate-300/40 group-hover:border-cyan-400/50 transition-colors"></div>
                <button
                  class="hidden group-hover:inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-600 text-xs font-medium hover:bg-cyan-500/20 shrink-0 mx-2"
                >
                  +
                </button>
                <div class="w-full border-t border-dashed border-slate-300/40 group-hover:border-cyan-400/50 transition-colors"></div>
              </div>
            </template>
          </div>
        </div>

        <!-- Natural language editing -->
        <div class="glass-panel rounded-2xl border border-slate-200 p-6">
          <label class="block text-slate-700 font-medium mb-3 text-sm">自然语言修改</label>
          <textarea
            v-model="editingInstruction"
            rows="2"
            placeholder="例如：删除第一题，将第二题标题改为「你对本次活动的整体评价」"
            class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none resize-y mb-3"
          ></textarea>
          <button
            @click="doEditQuestions"
            :disabled="!editingInstruction.trim() || editingProcessing"
            class="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 disabled:opacity-40 transition-colors"
          >
            <span v-if="editingProcessing" class="inline-flex items-center gap-2">
              <span class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
              处理中...
            </span>
            <span v-else>执行</span>
          </button>
        </div>

        <!-- Preview -->
        <div class="glass-panel rounded-2xl border border-slate-200 p-6">
          <h2 class="text-slate-700 font-semibold text-sm mb-4">预览</h2>
          <SurveyForm :questions="questions" mode="preview" />
        </div>

        <div v-if="error" class="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          {{ error }}
        </div>

        <!-- Auto-save indicator -->
        <div v-if="saveStatus" class="text-xs text-slate-500 text-center">
          <template v-if="saveStatus === 'saving'">⏳ 自动保存中...</template>
          <template v-else>✅ 已自动保存</template>
        </div>

        <div class="flex gap-3">
          <button
            @click="doSave"
            :disabled="saving"
            class="flex-1 px-5 py-3 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-600 disabled:opacity-40 transition-all"
          >
            <span v-if="saving">保存中...</span>
            <span v-else>{{ surveyId ? '💾 保存并返回' : '💾 保存草稿' }}</span>
          </button>
          <button
            v-if="!surveyId"
            @click="questions = []"
            class="px-5 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-700 transition-all text-sm"
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
  background: #f8fafc;
}

.glass-panel {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
</style>
