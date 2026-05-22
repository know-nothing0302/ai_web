<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps<{
  visible: boolean;
  pageRoute: string;
  pageTitle: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { type: "bug" | "ux" | "content" | "other"; content: string; contact?: string }];
}>();

const feedbackType = ref<"bug" | "ux" | "content" | "other">("ux");
const content = ref("");
const contact = ref("");

const canSubmit = computed(() => content.value.trim().length > 0 && !props.submitting);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      feedbackType.value = "ux";
      content.value = "";
      contact.value = "";
    }
  }
);

const handleSubmit = (): void => {
  if (!canSubmit.value) {
    return;
  }
  emit("submit", {
    type: feedbackType.value,
    content: content.value.trim(),
    contact: contact.value.trim() || undefined,
  });
};
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4"
  >
    <section class="w-full max-w-lg rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl">
      <header class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-[#0f4069]">意见反馈</h2>
          <p class="mt-1 text-sm text-[#6e89a3]">提交问题或建议，便于后续持续优化。</p>
        </div>
        <button
          type="button"
          class="rounded-xl p-2 text-[#6e89a3] transition-colors hover:bg-[#f3f8fc] hover:text-[#0f4069]"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </header>

      <div class="space-y-3">
        <select v-model="feedbackType" class="input-ai">
          <option value="bug">问题报错</option>
          <option value="ux">体验建议</option>
          <option value="content">内容建议</option>
          <option value="other">其他</option>
        </select>
        <textarea
          v-model="content"
          rows="6"
          class="input-ai resize-none"
          placeholder="请描述你的问题或建议"
        ></textarea>
        <input
          v-model="contact"
          class="input-ai"
          placeholder="联系方式（选填）"
        />
      </div>

      <div class="mt-4 rounded-2xl bg-[#f8fbfe] px-4 py-3 text-xs text-[#6e89a3]">
        当前页面：{{ pageTitle }}（{{ pageRoute }}）
      </div>

      <div class="mt-5 flex justify-end gap-3">
        <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
        <button type="button" class="btn-primary" :disabled="!canSubmit" @click="handleSubmit">
          {{ submitting ? "提交中..." : "提交" }}
        </button>
      </div>
    </section>
  </div>
</template>
