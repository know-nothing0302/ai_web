<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ArrowUp, Square, X } from "lucide-vue-next";

import { type PageAgentMessage } from "../page_agent/types";
import { renderMarkdown } from "../shared/markdown";

const props = defineProps<{
  visible: boolean;
  loading: boolean;
  question: string;
  messages: PageAgentMessage[];
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
  stop: [];
  copy: [value: string];
  "update:question": [value: string];
}>();

const messageContainerRef = ref<HTMLElement | null>(null);

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key !== "Enter") {
    return;
  }
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  if (!props.loading && props.question.trim()) {
    emit("submit");
  }
};

watch(
  () => [props.visible, props.messages.length],
  async () => {
    await nextTick();
    messageContainerRef.value?.scrollTo({
      top: messageContainerRef.value.scrollHeight,
      behavior: "smooth",
    });
  }
);
</script>

<template>
  <div v-if="visible" class="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 pointer-events-none">
    <section
      class="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-[24px] border border-[#81d4fa]/55 bg-white/96 shadow-[0_20px_48px_-28px_rgba(2,136,209,0.38)] backdrop-blur-xl"
    >
      <header class="flex items-center justify-between border-b border-[#b3e5fc]/35 px-4 py-3">
        <h2 class="text-sm font-semibold text-[#0f4069]">AI 智能分析与搜索</h2>
        <button
          type="button"
          class="rounded-xl p-2 text-[#6b86a0] transition-colors hover:bg-[#eaf7ff] hover:text-[#01579b]"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </header>

      <div
        ref="messageContainerRef"
        class="max-h-[44vh] min-h-[190px] overflow-y-auto px-4 py-4"
      >
        <div v-if="messages.length === 0" class="rounded-2xl bg-[#f8fbfe] px-4 py-5 text-center text-sm text-[#7b95ad]">
          可以直接问当前页面内容
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="message in messages"
            :key="message.id"
            class="flex"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              v-if="message.role === 'user'"
              class="max-w-[78%] rounded-2xl bg-[#0288d1] px-4 py-2.5 text-sm leading-6 text-white shadow-sm"
            >
              {{ message.text }}
            </div>
            <div
              v-else
              class="max-w-[86%] rounded-2xl border border-[#d8edf9] bg-[#f8fbfe] px-4 py-3 text-sm text-[#355878] shadow-[0_10px_24px_-22px_rgba(15,64,105,0.45)]"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-[11px] text-[#6e89a3]">
                  {{ message.meta?.usedSiteSearch ? "已结合站内检索" : "已基于当前页面回答" }}
                </span>
                <button
                  type="button"
                  class="rounded-lg px-2 py-1 text-[11px] text-[#6e89a3] transition-colors hover:bg-white hover:text-[#01579b]"
                  @click="emit('copy', message.text)"
                >
                  复制
                </button>
              </div>
              <div
                class="prose prose-slate max-w-none text-sm leading-6 text-[#355878] prose-p:my-2 prose-strong:text-[#0f4069] prose-a:text-[#0288d1] hover:prose-a:text-[#01579b] prose-ul:my-2 prose-ol:my-2 prose-code:rounded prose-code:bg-[#e1f5fe]/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[#0288d1] prose-code:before:content-none prose-code:after:content-none"
                v-html="renderMarkdown(message.text)"
              ></div>
              <div
                v-if="message.sources?.length"
                class="mt-3 space-y-2 border-t border-[#d8edf9] pt-3"
              >
                <a
                  v-for="source in message.sources"
                  :key="`${source.type}-${source.url}-${source.title}`"
                  :href="source.url"
                  class="block rounded-xl bg-white px-3 py-2 text-xs text-[#0288d1] transition-colors hover:bg-[#f5fbff] hover:text-[#01579b]"
                >
                  {{ source.title }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-[#b3e5fc]/35 px-4 py-3">
        <div class="flex items-end justify-between gap-3">
          <textarea
            :value="question"
            rows="2"
            class="max-h-28 min-h-[48px] w-full resize-none rounded-2xl border border-[#81d4fa]/60 bg-[#fcfeff] px-3 py-2.5 text-sm text-[#355878] outline-none transition-colors placeholder:text-xs placeholder:text-[#7ba1bb]/75 focus:border-[#0288d1]"
            placeholder="问当前页面内容… Enter 发送，Shift + Enter 换行"
            @input="emit('update:question', ($event.target as HTMLTextAreaElement).value)"
            @keydown="handleKeydown"
          ></textarea>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-[#0288d1] text-white transition-colors hover:bg-[#0277bd] disabled:cursor-not-allowed disabled:bg-[#9ecfe7]"
            :disabled="!loading && !question.trim()"
            @click="loading ? emit('stop') : emit('submit')"
          >
            <Square v-if="loading" class="h-4 w-4 fill-current" />
            <ArrowUp v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
