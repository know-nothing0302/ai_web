<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useDraggable } from "../composables/useDraggable";

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

/** 10 字下限校验 */
const canSubmit = computed(() => content.value.trim().length >= 10 && !props.submitting);

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

const { dialogPos, dragging, startDrag } = useDraggable();
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] bg-[#0f4069]/18 px-4"
    :style="dragging ? { pointerEvents: 'none' } : {}"
  >
    <section
      class="w-full max-w-lg rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl"
      :style="{ transform: `translate(${dialogPos.x}px, ${dialogPos.y}px)` }"
    >
      <header
        class="feedback-drag-handle mb-4 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
        @mousedown="startDrag"
      >
        <div>
          <h2 class="text-lg font-semibold text-[#0f4069]">
            {{ pageTitle === 'AI在徐医' ? '意见反馈' : `反馈 - ${pageTitle}` }}
          </h2>
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
          placeholder="请描述你的问题或建议（10字以上）"
        ></textarea>
        <p v-if="content.trim().length > 0 && content.trim().length < 10" class="text-xs text-amber-600">
          至少输入 10 个字（当前 {{ content.trim().length }} 字）
        </p>
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
