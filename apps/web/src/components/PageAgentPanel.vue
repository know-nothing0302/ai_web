<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ArrowUp, Square, X, MessageSquare, Plus, Search, Zap, BookOpen, Star, Share2, Minimize2, ChevronUp } from "lucide-vue-next";

import { type PageAgentConversation, type PageAgentMessage } from "../page_agent/types";
import { renderMarkdown } from "../shared/markdown";

const props = defineProps<{
  visible: boolean;
  minimized: boolean;
  hasUnreadReply: boolean;
  loading: boolean;
  question: string;
  messages: PageAgentMessage[];
  conversations: PageAgentConversation[];
  loadingConversations: boolean;
  conversationsHasMore: boolean;
  verbosity: "concise" | "detailed";
  pageType?: string;
}>();

const emit = defineEmits<{
  close: [];
  minimize: [];
  expand: [];
  submit: [];
  stop: [];
  copy: [value: string];
  "update:question": [value: string];
  "update:verbosity": [value: "concise" | "detailed"];
  "load-conversations": [];
  "load-more-conversations": [];
  "select-conversation": [id: string];
  "new-conversation": [];
}>();

const messageContainerRef = ref<HTMLElement | null>(null);
const convSearch = ref("");
const convFilter = ref<"all" | "article_detail" | "article_list" | "subscription" | "admin">("all");

const filteredConversations = computed(() => {
  let list = props.conversations;
  if (convFilter.value !== "all") {
    list = list.filter((c) => c.pageType === convFilter.value);
  }
  if (convSearch.value.trim()) {
    const q = convSearch.value.trim().toLowerCase();
    list = list.filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.pageTitle ?? "").toLowerCase().includes(q)
    );
  }
  return list;
});

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

watch(
  () => props.visible,
  (open) => {
    if (open) {
      convSearch.value = "";
      convFilter.value = "all";
    }
  }
);

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// Answer favorites (localStorage-based)
const FAV_KEY = "ai-web-fav-answers";
const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
};
const favoritedIds = ref<Set<string>>(loadFavorites());

const toggleFavorite = (msgId: string): void => {
  const next = new Set(favoritedIds.value);
  if (next.has(msgId)) {
    next.delete(msgId);
  } else {
    next.add(msgId);
  }
  favoritedIds.value = next;
  localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
};

const copyToast = ref("");
let copyToastTimer: ReturnType<typeof setTimeout> | null = null;
const doCopy = (text: string): void => {
  navigator.clipboard.writeText(text).then(() => {
    copyToast.value = "已复制";
    if (copyToastTimer) clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(() => { copyToast.value = ""; }, 1500);
  }).catch(() => {
    copyToast.value = "复制失败";
    if (copyToastTimer) clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(() => { copyToast.value = ""; }, 1500);
  });
};

const doShare = (text: string): void => {
  const excerpt = text.slice(0, 200) + (text.length > 200 ? "…" : "");
  const shareText = `[AI在徐医 智能问答]\n${excerpt}\n\n—— 来自 AI在徐医 智能助手`;
  navigator.clipboard.writeText(shareText).then(() => {
    copyToast.value = "已复制分享内容";
    if (copyToastTimer) clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(() => { copyToast.value = ""; }, 1500);
  }).catch(() => {
    copyToast.value = "分享失败";
    if (copyToastTimer) clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(() => { copyToast.value = ""; }, 1500);
  });
};

const filterOptions = [
  { value: "all" as const, label: "全部" },
  { value: "article_detail" as const, label: "文章" },
  { value: "article_list" as const, label: "资讯" },
  { value: "subscription" as const, label: "订阅" },
  { value: "admin" as const, label: "管理" },
];
</script>

<template>
  <!-- Full panel -->
  <div v-if="visible && !minimized" class="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 pointer-events-none">
    <section
      class="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-[24px] border border-[#81d4fa]/55 dark:border-sky-700/50 bg-white/96 dark:bg-slate-800/96 shadow-[0_20px_48px_-28px_rgba(2,136,209,0.38)] dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <header class="border-b border-[#b3e5fc]/35 dark:border-slate-600/35 px-4 py-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold bg-clip-text text-transparent bg-gradient-to-r from-[#0288d1] to-[#01579b] whitespace-nowrap">AI在徐医 · 问答</span>
          <div class="flex items-center gap-1">
            <button
              v-if="conversations.length === 0 && !loadingConversations"
              type="button"
              class="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-[#0288d1] dark:text-[#38bdf8] transition-colors hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50"
              @click="emit('load-conversations')"
            >
              <MessageSquare class="h-3.5 w-3.5" />
              历史对话
            </button>
            <button
              v-if="messages.length > 0 || conversations.length > 0"
              type="button"
              class="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-[#0288d1] dark:text-[#38bdf8] transition-colors hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50"
              @click="emit('new-conversation')"
            >
              <Plus class="h-3.5 w-3.5" />
              新建对话
            </button>
            <button
              type="button"
              class="rounded-xl p-2 text-[#6b86a0] dark:text-slate-400 transition-colors hover:bg-[#eaf7ff] dark:hover:bg-slate-700/50 hover:text-[#01579b] dark:hover:text-[#7dd3fc]"
              title="最小化"
              @click="emit('minimize')"
            >
              <Minimize2 class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="rounded-xl p-2 text-[#6b86a0] dark:text-slate-400 transition-colors hover:bg-[#eaf7ff] dark:hover:bg-slate-700/50 hover:text-[#01579b] dark:hover:text-[#7dd3fc]"
              @click="emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
        <!-- Verbosity & Citation Controls -->
        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
            :class="verbosity === 'concise' ? 'bg-[#0288d1] text-white' : 'bg-[#e1f5fe] text-[#0288d1] hover:bg-[#b3e5fc] dark:bg-slate-700/50 dark:text-[#38bdf8] dark:hover:bg-slate-600/50'"
            @click="emit('update:verbosity', 'concise')"
          >
            <Zap class="h-3 w-3 inline -mt-0.5 mr-0.5" />
            精简
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
            :class="verbosity === 'detailed' ? 'bg-[#0288d1] text-white' : 'bg-[#e1f5fe] text-[#0288d1] hover:bg-[#b3e5fc] dark:bg-slate-700/50 dark:text-[#38bdf8] dark:hover:bg-slate-600/50'"
            @click="emit('update:verbosity', 'detailed')"
          >
            <BookOpen class="h-3 w-3 inline -mt-0.5 mr-0.5" />
            详细
          </button>
        </div>
      </header>

      <div
        ref="messageContainerRef"
        class="max-h-[44vh] min-h-[190px] overflow-y-auto px-4 py-4"
      >
        <div v-if="messages.length === 0 && !loadingConversations && conversations.length === 0" class="rounded-2xl bg-[#f8fbfe] dark:bg-slate-800/40 px-4 py-5 text-center text-sm text-[#7b95ad] dark:text-slate-400">
          <p>可以直接问当前页面内容</p>
          <p class="mt-1 text-xs text-[#9bb5cc]">点击上方「历史对话」查看最近记录</p>
        </div>
        <div v-else-if="messages.length === 0 && loadingConversations" class="flex items-center justify-center py-8 text-sm text-[#7b95ad]">
          加载历史对话…
        </div>
        <div v-else-if="messages.length === 0 && conversations.length > 0" class="space-y-2">
          <div class="mb-3 flex items-center gap-2 text-xs font-medium text-[#6e89a3]">
            <MessageSquare class="h-3.5 w-3.5" />
            历史对话
          </div>
          <!-- Search & Filter -->
          <div class="flex items-center gap-2">
            <div class="flex-1 flex items-center gap-1 rounded-lg border border-[#81d4fa]/50 bg-white px-2.5 py-1.5">
              <Search class="h-3 w-3 text-[#8aa3bc] shrink-0" />
              <input
                v-model="convSearch"
                class="w-full bg-transparent text-xs text-[#355878] outline-none placeholder:text-[#9bb5cc]"
                placeholder="搜索对话..."
              />
            </div>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            <button
              v-for="opt in filterOptions"
              :key="opt.value"
              type="button"
              class="rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors"
              :class="convFilter === opt.value ? 'bg-[#0288d1] text-white' : 'bg-[#e1f5fe] text-[#0288d1] hover:bg-[#b3e5fc] dark:bg-slate-700/50 dark:text-[#38bdf8] dark:hover:bg-slate-600/50'"
              @click="convFilter = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
          <!-- Filtered list -->
          <div v-if="filteredConversations.length === 0" class="rounded-xl bg-[#f8fbfe] px-3 py-4 text-center text-xs text-[#9bb5cc]">
            没有匹配的对话
          </div>
          <button
            v-for="conv in filteredConversations"
            :key="conv.id"
            type="button"
            class="w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#eaf7ff]"
            @click="emit('select-conversation', conv.id)"
          >
            <span class="line-clamp-1 text-[#0f4069]">{{ conv.title || conv.pageTitle || "未命名对话" }}</span>
            <span class="mt-0.5 block text-[11px] text-[#8aa3bc]">{{ formatTime(conv.createdAt) }}</span>
          </button>
          <button
            v-if="conversationsHasMore"
            type="button"
            class="w-full rounded-xl px-3 py-2 text-center text-xs font-medium text-[#0288d1] transition-colors hover:bg-[#eaf7ff]"
            :disabled="loadingConversations"
            @click="emit('load-more-conversations')"
          >
            {{ loadingConversations ? '加载中...' : '加载更多' }}
          </button>
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
              class="max-w-[86%] rounded-2xl border border-[#d8edf9] dark:border-slate-600 bg-[#f8fbfe] dark:bg-slate-700 px-4 py-3 text-sm text-[#355878] dark:text-slate-200 shadow-[0_10px_24px_-22px_rgba(15,64,105,0.45)] dark:shadow-[0_10px_24px_-22px_rgba(0,0,0,0.3)]"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <span v-if="message.text.trim()" class="text-[11px] text-[#6e89a3]">
                  {{ message.meta?.usedSiteSearch ? "已结合站内检索" : "已基于当前页面回答" }}
                </span>
                <span v-else-if="loading" class="text-[11px] text-[#6e89a3] animate-pulse">
                  ● 正在分析...
                </span>
                <span v-else class="text-[11px] text-[#e57373]">
                  ⚠️ 回答异常
                </span>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-lg px-1.5 py-1 text-[11px] transition-colors"
                    :class="favoritedIds.has(message.id) ? 'text-[#f59e0b] hover:text-[#e65100]' : 'text-[#6e89a3] hover:text-[#f59e0b]'"
                    :title="favoritedIds.has(message.id) ? '取消收藏' : '收藏'"
                    @click="toggleFavorite(message.id)"
                  >
                    <Star class="w-3.5 h-3.5" :class="favoritedIds.has(message.id) ? 'fill-current' : ''" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg px-1.5 py-1 text-[11px] text-[#6e89a3] transition-colors hover:text-[#01579b]"
                    title="转发"
                    @click="doShare(message.text)"
                  >
                    <Share2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-lg px-1.5 py-1 text-[11px] text-[#6e89a3] transition-colors hover:text-[#01579b]"
                    title="复制"
                    @click="doCopy(message.text)"
                  >
                    复制
                  </button>
                </div>
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

      <div class="border-t border-[#b3e5fc]/35 dark:border-slate-600/35 px-4 py-3">
        <div v-if="copyToast" class="mb-2 text-center">
          <span class="inline-block rounded-full bg-[#0288d1]/10 px-3 py-1 text-xs font-medium text-[#0288d1]">{{ copyToast }}</span>
        </div>
        <div class="flex items-end justify-between gap-3">
          <textarea
            :value="question"
            rows="2"
            class="max-h-28 min-h-[48px] w-full resize-none rounded-2xl border-2 border-[#81d4fa]/60 bg-[#fcfeff] px-3 py-2.5 text-sm text-[#355878] outline-none transition-all placeholder:text-xs placeholder:text-[#7ba1bb]/75 focus:border-[#0288d1] focus:ring-4 focus:ring-[#0288d1]/12"
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

  <!-- Minimized floating bar -->
  <div v-if="visible && minimized" class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
    <div class="pointer-events-auto relative group">
      <!-- glow -->
      <div
        class="absolute -inset-1 bg-gradient-to-r from-[#b3e5fc] to-[#81d4fa] rounded-full blur transition-all duration-700 opacity-35 animate-[page-agent-breathe_3.2s_ease-in-out_infinite]"
      ></div>
      <!-- pill -->
      <div class="relative flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-[#0288d1]/25 bg-white/96 dark:bg-slate-800/96 backdrop-blur-xl shadow-[0_20px_48px_-28px_rgba(2,136,209,0.38)] dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)]">
        <!-- icon + label -->
        <span class="text-xs font-semibold bg-clip-text text-transparent bg-gradient-to-r from-[#0288d1] to-[#01579b] whitespace-nowrap">AI在徐医 · 问答</span>

        <!-- status badge -->
        <span
          v-if="loading"
          class="flex items-center gap-1 rounded-full bg-[#e1f5fe] dark:bg-sky-900/50 px-2 py-0.5 text-[10px] font-medium text-[#0288d1] dark:text-[#38bdf8]"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#0288d1] dark:bg-[#38bdf8] animate-pulse"></span>
          回答中
        </span>
        <span
          v-else-if="hasUnreadReply"
          class="flex items-center gap-1 rounded-full bg-[#fff3e0] dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-[#e65100] dark:text-[#fbbf24]"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#e65100] dark:bg-[#fbbf24]"></span>
          新回复
        </span>

        <!-- expand button -->
        <button
          type="button"
          class="ml-1 flex items-center justify-center w-6 h-6 rounded-full bg-[#0288d1] text-white transition-colors hover:bg-[#0277bd]"
          title="展开"
          @click="emit('expand')"
        >
          <ChevronUp class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes page-agent-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.32;
  }
  50% {
    transform: scale(1.04);
    opacity: 0.42;
  }
}
</style>
