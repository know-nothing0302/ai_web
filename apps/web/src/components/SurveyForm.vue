<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import type { SurveyQuestion } from "../services/api";

const props = defineProps<{
  questions: SurveyQuestion[];
  mode?: "edit" | "preview" | "fill";
  modelValue?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Record<string, unknown>];
}>();

const answers = shallowRef<Record<string, unknown>>({ ...props.modelValue });

watch(
  () => props.modelValue,
  (v) => {
    if (v) answers.value = { ...v };
  }
);

// Compute visibility map once as a computed, re-triggered on answer change
const visibilityMap = computed(() => {
  const map = new Map<string, boolean>();
  const visited = new Set<string>();

  const check = (q: SurveyQuestion): boolean => {
    if (map.has(q.id)) return map.get(q.id)!;
    if (visited.has(q.id)) return true; // circular guard
    visited.add(q.id);

    if (!q.showIf) {
      map.set(q.id, true);
      return true;
    }

    const { questionId, op, value } = q.showIf;
    const answer = answers.value[questionId];

    // Check dependency visibility recursively
    const dep = props.questions.find((dq) => dq.id === questionId);
    if (dep) {
      const depVisible = check(dep);
      if (!depVisible) {
        map.set(q.id, false);
        return false;
      }
    }

    if (answer === undefined || answer === null) {
      map.set(q.id, false);
      return false;
    }

    let result = true;
    switch (op) {
      case "eq":
        result = String(answer) === String(value);
        break;
      case "neq":
        result = String(answer) !== String(value);
        break;
      case "includes": {
        const arr = Array.isArray(answer) ? answer : [answer];
        result = arr.map(String).includes(String(value));
        break;
      }
    }
    map.set(q.id, result);
    return result;
  };

  for (const q of props.questions) {
    check(q);
  }
  return map;
});

const visibleQuestions = computed(() =>
  props.questions.filter((q) => visibilityMap.value.get(q.id) !== false)
);

const setAnswer = (questionId: string, value: unknown) => {
  const newVal = { ...answers.value, [questionId]: value };

  // Clear answers for questions that are now hidden
  for (const q of props.questions) {
    if (!isVisibleWithAnswers(q, newVal)) {
      delete newVal[q.id];
    }
  }

  answers.value = newVal;
  emit("update:modelValue", newVal);
};

// Use a specific answer set for visibility check
const isVisibleWithAnswers = (
  q: SurveyQuestion,
  ans: Record<string, unknown>,
  visited: Set<string> = new Set()
): boolean => {
  if (!q.showIf) return true;
  if (visited.has(q.id)) return false;
  visited.add(q.id);

  const { questionId, op, value } = q.showIf;
  const answer = ans[questionId];

  const dep = props.questions.find((dq) => dq.id === questionId);
  if (dep && !isVisibleWithAnswers(dep, ans, visited)) return false;

  if (answer === undefined || answer === null) return false;

  switch (op) {
    case "eq":
      return String(answer) === String(value);
    case "neq":
      return String(answer) !== String(value);
    case "includes": {
      const arr = Array.isArray(answer) ? answer : [answer];
      return arr.map(String).includes(String(value));
    }
    default:
      return true;
  }
};

const findQuestion = (id: string) => props.questions.find((q) => q.id === id);

const getShowIfLabel = (q: SurveyQuestion): string | null => {
  if (!q.showIf) return null;
  const dep = findQuestion(q.showIf.questionId);
  const depLabel = dep?.title || q.showIf.questionId;
  let opLabel: string;
  switch (q.showIf.op) {
    case "eq":
      opLabel = "选择了";
      break;
    case "neq":
      opLabel = "未选择";
      break;
    case "includes":
      opLabel = "包含";
      break;
  }
  return `当「${depLabel}」${opLabel}「${q.showIf.value}」时显示`;
};

const toggleMultiOption = (questionId: string, option: string) => {
  const current = Array.isArray(answers.value[questionId])
    ? [...(answers.value[questionId] as unknown[])]
    : [];
  const idx = current.indexOf(option);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(option);
  }
  setAnswer(questionId, current);
};
</script>

<template>
  <div class="survey-form space-y-6">
    <div
      v-for="q in visibleQuestions"
      :key="q.id"
      class="survey-question p-5 rounded-xl border border-slate-200 bg-white"
    >
      <label :for="`q-${q.id}`" class="block mb-3 text-slate-700 font-medium text-sm">
        {{ q.title }}
        <span v-if="q.required" class="text-red-400 ml-1">*</span>
      </label>

      <!-- showIf indicator -->
      <div
        v-if="getShowIfLabel(q)"
        class="mb-3 text-xs text-slate-500 italic"
      >
        {{ getShowIfLabel(q) }}
      </div>

      <!-- single_choice -->
      <div v-if="q.type === 'single_choice'" class="space-y-2">
        <label
          v-for="opt in q.options"
          :key="opt"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-300 cursor-pointer hover:border-cyan-500/40 transition-colors text-slate-600 text-sm"
          :class="{
            'border-cyan-400 bg-cyan-50 text-cyan-700': answers[q.id] === opt,
          }"
        >
          <input
            type="radio"
            :name="`q-${q.id}`"
            :value="opt"
            :checked="answers[q.id] === opt"
            @change="setAnswer(q.id, opt)"
            class="sr-only"
          />
          <span
            class="w-4 h-4 rounded-full border-2 flex-shrink-0"
            :class="
              answers[q.id] === opt
                ? 'border-cyan-400 bg-cyan-400'
                : 'border-slate-500'
            "
          ></span>
          {{ opt }}
        </label>
      </div>

      <!-- multiple_choice -->
      <div v-if="q.type === 'multiple_choice'" class="space-y-2">
        <label
          v-for="opt in q.options"
          :key="opt"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-300 cursor-pointer hover:border-cyan-500/40 transition-colors text-slate-600 text-sm"
          :class="{
            'border-cyan-400 bg-cyan-50 text-cyan-700': (
              Array.isArray(answers[q.id]) ? answers[q.id] as unknown[] : []
            ).includes(opt),
          }"
        >
          <input
            type="checkbox"
            :value="opt"
            :checked="(
              Array.isArray(answers[q.id]) ? answers[q.id] as unknown[] : []
            ).includes(opt)"
            @change="toggleMultiOption(q.id, opt)"
            class="sr-only"
          />
          <span
            class="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center"
            :class="
              (Array.isArray(answers[q.id]) ? (answers[q.id] as unknown[]).includes(opt) : false)
                ? 'border-cyan-400 bg-cyan-400'
                : 'border-slate-500'
            "
          >
            <span
              v-if="(Array.isArray(answers[q.id]) ? (answers[q.id] as unknown[]).includes(opt) : false)"
              class="text-[10px] text-slate-900 font-bold"
              >✓</span
            >
          </span>
          {{ opt }}
        </label>
      </div>

      <!-- text -->
      <textarea
        v-if="q.type === 'text'"
        :id="`q-${q.id}`"
        :value="(answers[q.id] as string) ?? ''"
        @input="setAnswer(q.id, ($event.target as HTMLTextAreaElement).value)"
        rows="3"
        class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none resize-y"
        placeholder="请输入..."
      ></textarea>

      <!-- rating -->
      <div v-if="q.type === 'rating'" class="flex gap-1">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          @click="setAnswer(q.id, star)"
          class="text-2xl transition-colors px-1"
          :class="
            Number(answers[q.id] ?? 0) >= star
              ? 'text-yellow-400'
              : 'text-slate-400 hover:text-yellow-400/50'
          "
        >
          ★
        </button>
      </div>
    </div>

    <div v-if="visibleQuestions.length === 0" class="text-center text-slate-500 py-8">
      暂无可见题目
    </div>
  </div>
</template>
