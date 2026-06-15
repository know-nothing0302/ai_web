<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Clock, User, Hash, Sparkles, Link, Copy, Check, } from "lucide-vue-next";

import { buildArticleDetailContext, setPageAgentContext } from "../page_agent/context";
import {
  getArticle,
  reportArticleView,
  checkFavorite,
  addFavorite,
  removeFavorite,
  reportReadingHistory,
  submitFeedback,
  type Article,
} from "../services/api";
import { renderMarkdown } from "../shared/markdown";
import { logger } from "../shared/logger";
import BackToTop from "../components/BackToTop.vue";

const route = useRoute();
const router = useRouter();
const item = ref<Article | null>(null);
const loading = ref(false);
const isFavorited = ref(false);
const favoriting = ref(false);
const linkReported = ref(false);

const reportBrokenLink = async (): Promise<void> => {
  if (!item.value?.originalUrl) return;
  try {
    await submitFeedback({
      type: "bug",
      content: `[链接失效] 文章「${item.value.title}」的原文链接无法访问：${item.value.originalUrl}`,
      pageRoute: route.fullPath,
      pageTitle: document.title || item.value.title,
    });
    linkReported.value = true;
  } catch {
    // silent — user can retry
  }
};

const parsedContent = computed(() => {
  if (!item.value?.content) return "";
  return renderMarkdown(item.value.content);
});

const parsedSummary = computed(() => {
  if (!item.value?.summary) return "";
  return renderMarkdown(item.value.summary);
});

const displayAuthor = computed(() => {
  const raw = item.value?.author?.trim();
  if (!raw) return "未知作者";
  // Split by common delimiters: comma, Chinese comma, semicolon, slash
  const parts = raw.split(/[,，;；/、]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return raw;
  return `${parts[0]}等`;
});

const load = async (): Promise<void> => {
  console.info("[AIWEB] ArticleDetailPage 加载文章详情", { id: route.params.id?.toString() ?? "" });
  loading.value = true;
  try {
    const articleId = route.params.id.toString();
    item.value = await getArticle(articleId);
    // 记录浏览历史
    reportArticleView({
      articleId: item.value.id,
      channelCode: item.value.channelCode,
      pageRoute: route.fullPath,
      pageTitle: item.value.title,
    }).catch(() => undefined);
    reportReadingHistory(articleId).catch(() => undefined);
    // 检查收藏状态
    checkFavorite(articleId).then((result) => {
      isFavorited.value = result.isFavorited;
    }).catch(() => undefined);
    // 加载标注 — 功能未成熟，暂注释
    // loadAnnotations();
  } finally {
    loading.value = false;
  }
};

const toggleFavorite = async (): Promise<void> => {
  if (favoriting.value || !item.value) return;
  favoriting.value = true;
  try {
    if (isFavorited.value) {
      await removeFavorite(item.value.id);
      isFavorited.value = false;
    } else {
      await addFavorite(item.value.id);
      isFavorited.value = true;
    }
  } catch (e) {
    logger.error('annotations', e);
  } finally {
    favoriting.value = false;
  }
};

// --- 文本标注（高亮 + 笔记）---
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const annotations = ref<UserAnnotation[]>([]);
// [ANNO-DISABLED] const showAnnoToolbar = ref(false);
// [ANNO-DISABLED] const annoToolbarStyle = ref<Record<string, string>>({});
// [ANNO-DISABLED] const currentSelection = ref<{ text: string; startOffset: number; endOffset: number } | null>(null);
// [ANNO-DISABLED] const editingAnnotation = ref<UserAnnotation | null>(null);
// [ANNO-DISABLED] const editingNote = ref("");
// [ANNO-DISABLED] const showNoteEditor = ref(false);
// [ANNO-DISABLED] const noteEditorStyle = ref<Record<string, string>>({});
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const HIGHLIGHT_COLORS = [
// [ANNO-DISABLED]   { key: "yellow", label: "黄色", bg: "bg-yellow-200", border: "border-yellow-400", text: "text-yellow-800" },
// [ANNO-DISABLED]   { key: "green", label: "绿色", bg: "bg-green-200", border: "border-green-400", text: "text-green-800" },
// [ANNO-DISABLED]   { key: "blue", label: "蓝色", bg: "bg-blue-200", border: "border-blue-400", text: "text-blue-800" },
// [ANNO-DISABLED]   { key: "pink", label: "粉色", bg: "bg-pink-200", border: "border-pink-400", text: "text-pink-800" },
// [ANNO-DISABLED] ] as const;
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const getAnnoContainer = (): HTMLElement | null => {
// [ANNO-DISABLED]   return document.querySelector(".article-content-area") as HTMLElement | null;
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const getSelectionOffsets = (container: HTMLElement): { text: string; startOffset: number; endOffset: number } | null => {
// [ANNO-DISABLED]   const sel = window.getSelection();
// [ANNO-DISABLED]   if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
// [ANNO-DISABLED]   const range = sel.getRangeAt(0);
// [ANNO-DISABLED]   if (!container.contains(range.commonAncestorContainer)) return null;
// [ANNO-DISABLED]   const text = range.toString().trim();
// [ANNO-DISABLED]   if (!text) return null;
// [ANNO-DISABLED]   const preRange = document.createRange();
// [ANNO-DISABLED]   preRange.selectNodeContents(container);
// [ANNO-DISABLED]   preRange.setEnd(range.startContainer, range.startOffset);
// [ANNO-DISABLED]   const startOffset = preRange.toString().length;
// [ANNO-DISABLED]   const endOffset = startOffset + text.length;
// [ANNO-DISABLED]   return { text, startOffset, endOffset };
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const handleTextSelection = (event: MouseEvent): void => {
// [ANNO-DISABLED]   const container = getAnnoContainer();
// [ANNO-DISABLED]   if (!container) return;
// [ANNO-DISABLED]   const sel = getSelectionOffsets(container);
// [ANNO-DISABLED]   if (!sel) {
    // Delay hiding to allow clicks on toolbar
// [ANNO-DISABLED]     setTimeout(() => {
// [ANNO-DISABLED]       if (!currentSelection.value) {
// [ANNO-DISABLED]         showAnnoToolbar.value = false;
// [ANNO-DISABLED]       }
// [ANNO-DISABLED]     }, 200);
// [ANNO-DISABLED]     return;
// [ANNO-DISABLED]   }
// [ANNO-DISABLED]   currentSelection.value = sel;
// [ANNO-DISABLED]   showAnnoToolbar.value = true;
// [ANNO-DISABLED]   annoToolbarStyle.value = {
// [ANNO-DISABLED]     left: `${event.clientX + window.scrollX}px`,
// [ANNO-DISABLED]     top: `${event.clientY + window.scrollY - 44}px`,
// [ANNO-DISABLED]   };
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const handleAnnotationClick = (event: MouseEvent, annotation: UserAnnotation): void => {
// [ANNO-DISABLED]   event.stopPropagation();
// [ANNO-DISABLED]   editingAnnotation.value = annotation;
// [ANNO-DISABLED]   editingNote.value = annotation.note || "";
// [ANNO-DISABLED]   const rect = (event.target as HTMLElement).getBoundingClientRect();
// [ANNO-DISABLED]   noteEditorStyle.value = {
// [ANNO-DISABLED]     left: `${rect.left + window.scrollX}px`,
// [ANNO-DISABLED]     top: `${rect.bottom + window.scrollY + 4}px`,
// [ANNO-DISABLED]   };
// [ANNO-DISABLED]   showNoteEditor.value = true;
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const highlightAnnotation = async (color: string): Promise<void> => {
// [ANNO-DISABLED]   if (!item.value || !currentSelection.value) return;
// [ANNO-DISABLED]   try {
// [ANNO-DISABLED]     const anno = await createAnnotation(item.value.id, {
// [ANNO-DISABLED]       selectedText: currentSelection.value.text,
// [ANNO-DISABLED]       startOffset: currentSelection.value.startOffset,
// [ANNO-DISABLED]       endOffset: currentSelection.value.endOffset,
// [ANNO-DISABLED]       color,
// [ANNO-DISABLED]     });
// [ANNO-DISABLED]     annotations.value.push(anno);
// [ANNO-DISABLED]     await nextTick();
// [ANNO-DISABLED]     applyHighlights();
// [ANNO-DISABLED]   } catch (e) {
// [ANNO-DISABLED]     logger.error('annotations', e);
// [ANNO-DISABLED]   } finally {
// [ANNO-DISABLED]     showAnnoToolbar.value = false;
// [ANNO-DISABLED]     currentSelection.value = null;
// [ANNO-DISABLED]     window.getSelection()?.removeAllRanges();
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const addNoteToSelection = async (): Promise<void> => {
// [ANNO-DISABLED]   if (!item.value || !currentSelection.value) return;
// [ANNO-DISABLED]   const note = prompt("请输入笔记内容：");
// [ANNO-DISABLED]   if (note === null) return;
// [ANNO-DISABLED]   try {
// [ANNO-DISABLED]     const anno = await createAnnotation(item.value.id, {
// [ANNO-DISABLED]       selectedText: currentSelection.value.text,
// [ANNO-DISABLED]       startOffset: currentSelection.value.startOffset,
// [ANNO-DISABLED]       endOffset: currentSelection.value.endOffset,
// [ANNO-DISABLED]       color: "yellow",
// [ANNO-DISABLED]       note: note || undefined,
// [ANNO-DISABLED]     });
// [ANNO-DISABLED]     annotations.value.push(anno);
// [ANNO-DISABLED]     await nextTick();
// [ANNO-DISABLED]     applyHighlights();
// [ANNO-DISABLED]   } catch (e) {
// [ANNO-DISABLED]     logger.error('annotations', e);
// [ANNO-DISABLED]   } finally {
// [ANNO-DISABLED]     showAnnoToolbar.value = false;
// [ANNO-DISABLED]     currentSelection.value = null;
// [ANNO-DISABLED]     window.getSelection()?.removeAllRanges();
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const saveNote = async (): Promise<void> => {
// [ANNO-DISABLED]   if (!item.value || !editingAnnotation.value) return;
// [ANNO-DISABLED]   try {
// [ANNO-DISABLED]     const updated = await updateAnnotation(item.value.id, editingAnnotation.value.id, {
// [ANNO-DISABLED]       note: editingNote.value || undefined,
// [ANNO-DISABLED]     });
// [ANNO-DISABLED]     const idx = annotations.value.findIndex((a) => a.id === updated.id);
// [ANNO-DISABLED]     if (idx !== -1) annotations.value[idx] = updated;
// [ANNO-DISABLED]   } catch (e) {
// [ANNO-DISABLED]     logger.error('annotations', e);
// [ANNO-DISABLED]   }
// [ANNO-DISABLED]   showNoteEditor.value = false;
// [ANNO-DISABLED]   editingAnnotation.value = null;
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const removeAnnotation = async (): Promise<void> => {
// [ANNO-DISABLED]   if (!item.value || !editingAnnotation.value) return;
// [ANNO-DISABLED]   try {
// [ANNO-DISABLED]     await deleteAnnotation(item.value.id, editingAnnotation.value.id);
// [ANNO-DISABLED]     annotations.value = annotations.value.filter((a) => a.id !== editingAnnotation.value!.id);
// [ANNO-DISABLED]     await nextTick();
// [ANNO-DISABLED]     applyHighlights();
// [ANNO-DISABLED]   } catch (e) {
// [ANNO-DISABLED]     logger.error('annotations', e);
// [ANNO-DISABLED]   }
// [ANNO-DISABLED]   showNoteEditor.value = false;
// [ANNO-DISABLED]   editingAnnotation.value = null;
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const loadAnnotations = async (): Promise<void> => {
// [ANNO-DISABLED]   if (!item.value) return;
// [ANNO-DISABLED]   try {
// [ANNO-DISABLED]     annotations.value = await getAnnotations(item.value.id);
// [ANNO-DISABLED]     await nextTick();
// [ANNO-DISABLED]     applyHighlights();
// [ANNO-DISABLED]   } catch (e) {
// [ANNO-DISABLED]     logger.error('annotations:applyHighlights', e);
// [ANNO-DISABLED]     annotations.value = [];
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const applyHighlights = (): void => {
// [ANNO-DISABLED]   const container = getAnnoContainer();
// [ANNO-DISABLED]   if (!container || annotations.value.length === 0) return;
  // Remove existing highlights first
// [ANNO-DISABLED]   container.querySelectorAll(".anno-highlight").forEach((el) => {
// [ANNO-DISABLED]     const parent = el.parentNode;
// [ANNO-DISABLED]     if (!parent) return;
// [ANNO-DISABLED]     while (el.firstChild) {
// [ANNO-DISABLED]       parent.insertBefore(el.firstChild, el);
// [ANNO-DISABLED]     }
// [ANNO-DISABLED]     parent.removeChild(el);
// [ANNO-DISABLED]   });
  // Sort annotations by startOffset for sequential processing
// [ANNO-DISABLED]   const sorted = [...annotations.value].sort((a, b) => a.startOffset - b.startOffset);
// [ANNO-DISABLED]   for (const anno of sorted) {
// [ANNO-DISABLED]     applySingleHighlight(container, anno);
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const applySingleHighlight = (container: HTMLElement, anno: UserAnnotation): void => {
// [ANNO-DISABLED]   const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
// [ANNO-DISABLED]   const wrapperRanges: Array<{ node: Text; start: number; end: number }> = [];
// [ANNO-DISABLED]   let offset = 0;
// [ANNO-DISABLED]   let node = walker.nextNode() as Text | null;
// [ANNO-DISABLED]   while (node) {
// [ANNO-DISABLED]     const len = node.textContent?.length ?? 0;
// [ANNO-DISABLED]     const nodeStart = offset;
// [ANNO-DISABLED]     const nodeEnd = offset + len;
// [ANNO-DISABLED]     if (nodeEnd > anno.startOffset && nodeStart < anno.endOffset) {
// [ANNO-DISABLED]       const s = Math.max(0, anno.startOffset - nodeStart);
// [ANNO-DISABLED]       const e = Math.min(len, anno.endOffset - nodeStart);
// [ANNO-DISABLED]       if (s < e) {
// [ANNO-DISABLED]         wrapperRanges.push({ node, start: s, end: e });
// [ANNO-DISABLED]       }
// [ANNO-DISABLED]     }
// [ANNO-DISABLED]     if (nodeStart >= anno.endOffset) break;
// [ANNO-DISABLED]     offset = nodeEnd;
// [ANNO-DISABLED]     node = walker.nextNode() as Text | null;
// [ANNO-DISABLED]   }
  // Wrap from last to first to preserve offsets
// [ANNO-DISABLED]   for (let i = wrapperRanges.length - 1; i >= 0; i--) {
// [ANNO-DISABLED]     const { node, start, end } = wrapperRanges[i];
// [ANNO-DISABLED]     try {
// [ANNO-DISABLED]       const range = document.createRange();
// [ANNO-DISABLED]       range.setStart(node, start);
// [ANNO-DISABLED]       range.setEnd(node, end);
// [ANNO-DISABLED]       const mark = document.createElement("mark");
// [ANNO-DISABLED]       mark.className = `anno-highlight anno-${anno.color}`;
// [ANNO-DISABLED]       mark.dataset.annotationId = anno.id;
// [ANNO-DISABLED]       mark.title = anno.note ? `笔记: ${anno.note}` : "高亮标注";
// [ANNO-DISABLED]       mark.style.cssText = [
// [ANNO-DISABLED]         "cursor: pointer",
// [ANNO-DISABLED]         "border-radius: 2px",
// [ANNO-DISABLED]         anno.color === "yellow" ? "background-color: #fef08a" : "",
// [ANNO-DISABLED]         anno.color === "green" ? "background-color: #bbf7d0" : "",
// [ANNO-DISABLED]         anno.color === "blue" ? "background-color: #bfdbfe" : "",
// [ANNO-DISABLED]         anno.color === "pink" ? "background-color: #fbcfe8" : "",
// [ANNO-DISABLED]       ].filter(Boolean).join("; ");
// [ANNO-DISABLED]       range.surroundContents(mark);
// [ANNO-DISABLED]     } catch (e) {
// [ANNO-DISABLED]       logger.error('annotations:surroundContents', e);
      // Skip if surrounding fails (e.g., partial selection across elements)
// [ANNO-DISABLED]     }
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// [ANNO-DISABLED] const handleDocumentClick = (e: MouseEvent): void => {
// [ANNO-DISABLED]   const target = e.target as HTMLElement;
// [ANNO-DISABLED] 
  // Check if clicking on an annotation highlight
// [ANNO-DISABLED]   if (target.classList.contains("anno-highlight")) {
// [ANNO-DISABLED]     const id = target.dataset.annotationId;
// [ANNO-DISABLED]     const anno = annotations.value.find((a) => a.id === id);
// [ANNO-DISABLED]     if (anno) handleAnnotationClick(e, anno);
// [ANNO-DISABLED]     return;
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] 
  // Close note editor if clicking outside
// [ANNO-DISABLED]   if (showNoteEditor.value) {
// [ANNO-DISABLED]     const editor = document.querySelector(".anno-note-editor");
// [ANNO-DISABLED]     if (editor && !editor.contains(target)) {
// [ANNO-DISABLED]       showNoteEditor.value = false;
// [ANNO-DISABLED]       editingAnnotation.value = null;
// [ANNO-DISABLED]     }
// [ANNO-DISABLED]   }
// [ANNO-DISABLED] };
// [ANNO-DISABLED] 
// Watch for content changes to re-apply highlights
// [ANNO-DISABLED] watch([parsedContent, () => annotations.value.length], async () => {
// [ANNO-DISABLED]   await nextTick();
// [ANNO-DISABLED]   applyHighlights();
// [ANNO-DISABLED] });
// [ANNO-DISABLED] 
const formatDate = (isoString?: string) => {
  if (!isoString) return "未提供";
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const linkCopied = ref(false);
const linkCopyMessage = ref("");
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

const copyLink = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    linkCopied.value = true;
    if (isWeChat) {
      linkCopyMessage.value = "链接已复制，请在微信中粘贴发送给朋友";
    }
    setTimeout(() => { linkCopied.value = false; linkCopyMessage.value = ""; }, 2500);
  } catch (e) {
    logger.error('annotations', e);
  }
};

onMounted(() => {
  console.log("[AIWEB] ArticleDetailPage onMounted", { articleId: route.params.id?.toString() ?? "" });
  load();
  window.addEventListener("popstate", handleBrowserBack);
  // 文本标注功能未成熟，暂注释
  // document.addEventListener("mouseup", handleTextSelection as EventListener);
  // document.addEventListener("click", handleDocumentClick);
});

watchEffect(() => {
  if (!item.value) {
    return;
  }
  setPageAgentContext(
    buildArticleDetailContext({
      route: route.fullPath,
      pageTitle: "文章详情",
      article: item.value,
    })
  );
});

const handleBrowserBack = (): void => {
  console.log("[AIWEB] ArticleDetailPage 浏览器返回", { from: route.fullPath });
};

onBeforeUnmount(() => {
  window.removeEventListener("popstate", handleBrowserBack);
  // 与 onMounted 中的标注事件监听对应
  // document.removeEventListener("mouseup", handleTextSelection as EventListener);
  // document.removeEventListener("click", handleDocumentClick);
  setPageAgentContext(null);
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <button @click="router.push('/')" class="flex items-center gap-2 text-[#4f6b8a] hover:text-[#01579b] dark:text-[#cbd5e1] dark:hover:text-[#7dd3fc] transition-colors">
      <ArrowLeft class="w-4 h-4" />
      返回列表
    </button>

    <div v-if="loading" class="flex items-center justify-center py-32">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0288d1]"></div>
    </div>

    <div v-else-if="!item" class="glass-card py-20 text-center">
      <h3 class="text-xl font-medium text-[#4f6b8a] dark:text-[#cbd5e1]">文章不存在或已被删除</h3>
    </div>

    <article v-else class="glass-panel rounded-3xl p-8 md:p-12 border shadow-sm">
      <header class="mb-10 text-center border-b border-[#b3e5fc]/50 dark:border-slate-600/50 pb-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <span class="badge-ai !bg-[#e1f5fe] !text-[#0277bd]">{{ item.category }}</span>
        </div>
        
        <div class="flex flex-col items-center justify-center gap-2 mb-5">
          <h1 class="text-xl sm:text-2xl font-bold text-[#0f4069] dark:text-[#e2e8f0] leading-tight tracking-tight font-serif text-center px-2">
            {{ item.title }}
          </h1>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="shrink-0 rounded-xl p-1.5 transition-all duration-300"
              :class="isFavorited ? 'text-[#f59e0b] hover:text-[#d97706] bg-[#fef3c7]/60 hover:bg-[#fef3c7] dark:bg-yellow-800/30 dark:hover:bg-yellow-800/50' : 'text-[#b3e5fc] hover:text-[#f59e0b] hover:bg-[#fef3c7]/40 dark:text-slate-500 dark:hover:text-yellow-400 dark:hover:bg-yellow-800/20'"
              :title="isFavorited ? '取消收藏' : '收藏'"
              :disabled="favoriting"
              @click="toggleFavorite"
            >
              <svg v-if="isFavorited" class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <svg v-else class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2zm0 2.46L9.91 9.23 5.13 10.08l4.07 3.97-.96 5.6L12 17.29l3.76 1.98-.96-5.6 4.07-3.97-4.78-.85L12 4.46z"/></svg>
            </button>
            <button
              type="button"
              class="shrink-0 rounded-xl p-1.5 transition-all duration-300"
              :class="linkCopied ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30' : 'text-[#b3e5fc] hover:text-[#0288d1] hover:bg-[#e1f5fe]/60 dark:text-slate-500 dark:hover:text-[#38bdf8] dark:hover:bg-slate-700/30'"
              :title="linkCopied ? '已复制' : '复制链接'"
              @click="copyLink"
            >
              <Copy v-if="!linkCopied" class="w-4 h-4" />
              <Check v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div v-if="item.tags && item.tags.length" class="flex flex-wrap items-center justify-center gap-2 mb-6">
          <span v-for="tag in item.tags" :key="tag" class="text-xs text-[#0288d1] bg-[#e1f5fe]/80 dark:text-[#38bdf8] dark:bg-slate-700/40 px-2.5 py-1 rounded-full flex items-center border border-[#81d4fa]/30 dark:border-sky-700/30">
            <Hash class="w-3 h-3 mr-0.5 opacity-70" />{{ tag }}
          </span>
        </div>
        
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-[#4f6b8a] dark:text-[#cbd5e1]">
          <span class="flex items-center gap-1.5">
            <User class="w-4 h-4 text-[#0288d1]/70" />
            {{ displayAuthor }}
          </span>
          <span class="flex items-center gap-1.5">
            <Clock class="w-4 h-4 text-[#0288d1]/70" />
            {{ formatDate(item.publishedAt) }}
          </span>
          <a
            v-if="item.originalUrl"
            :href="item.originalUrl"
            class="flex items-center gap-1 text-xs text-[#0288d1] hover:text-[#01579b] dark:text-[#38bdf8] dark:hover:text-[#7dd3fc] hover:underline transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
             <Link class="w-3.5 h-3.5 opacity-80" />
             查看原文
             <span class="text-[10px] text-[#8aa3bc] dark:text-slate-400 font-normal">（外部链接）</span>
          </a>
          <button
            v-if="item.originalUrl && !linkReported"
            type="button"
            class="text-[10px] text-[#8aa3bc] dark:text-slate-400 hover:text-[#c62828] dark:hover:text-red-400 hover:underline transition-colors"
            title="反馈链接失效"
            @click="reportBrokenLink"
          >
            链接失效？
          </button>
          <span v-else-if="linkReported" class="text-[10px] text-[#4caf50]">已反馈，感谢</span>
          <span v-if="!item.originalUrl" class="flex items-center gap-1.5 text-[#8aa3bc] dark:text-slate-400">
            <Link class="w-4 h-4 opacity-60" />
            未提供原文链接
          </span>
        </div>
      </header>

      <div class="bg-gradient-to-br from-[#e1f5fe] to-[#f1faff] dark:from-slate-800/60 dark:to-slate-800/40 border border-[#81d4fa]/60 dark:border-sky-700/30 rounded-2xl p-6 md:p-8 mb-12 shadow-sm">
        <div class="flex items-center gap-2 text-[#0288d1] dark:text-[#38bdf8] font-semibold mb-4 text-lg">
          <Sparkles class="w-5 h-5" />
          AI 核心摘要
        </div>
        <div
          class="prose prose-slate max-w-none text-[#355878] dark:text-slate-300 text-lg leading-relaxed font-serif
                 prose-headings:text-[#0f4069] dark:prose-headings:text-[#e2e8f0] prose-p:my-3 prose-ul:my-3 prose-ol:my-3
                 prose-a:text-[#0288d1] dark:prose-a:text-[#38bdf8] hover:prose-a:text-[#01579b] dark:hover:prose-a:text-[#7dd3fc]"
          v-html="parsedSummary"
        ></div>
      </div>

      <!-- Markdown Content rendering with tailwind typography styles manually applied for better fonts -->
      <div 
        class="article-content-area prose prose-slate prose-lg max-w-none text-[#355878] dark:text-slate-300 leading-loose font-serif
               prose-headings:text-[#0f4069] dark:prose-headings:text-[#e2e8f0] prose-headings:font-bold prose-headings:tracking-tight
               prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-5 prose-h2:border-b prose-h2:border-[#b3e5fc]/30 dark:prose-h2:border-slate-600/30 prose-h2:pb-2
               prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4
               prose-p:mb-6 prose-p:text-[17px]
               prose-a:text-[#0288d1] dark:prose-a:text-[#38bdf8] hover:prose-a:text-[#01579b] dark:hover:prose-a:text-[#7dd3fc] prose-a:no-underline hover:prose-a:underline
               prose-strong:text-[#0f4069] dark:prose-strong:text-[#e2e8f0] prose-strong:font-semibold
               prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-6 prose-ul:space-y-2
               prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-6 prose-ol:space-y-2
               prose-li:text-[17px] prose-li:marker:text-[#81d4fa] dark:prose-li:marker:text-sky-600
               prose-blockquote:border-l-4 prose-blockquote:border-[#81d4fa] dark:prose-blockquote:border-sky-700 prose-blockquote:pl-5 prose-blockquote:italic prose-blockquote:text-[#4f6b8a] dark:prose-blockquote:text-[#cbd5e1] prose-blockquote:bg-[#f1faff] dark:prose-blockquote:bg-slate-800/40 prose-blockquote:py-1 prose-blockquote:rounded-r-lg
               prose-code:text-[#0288d1] dark:prose-code:text-[#38bdf8] prose-code:bg-[#e1f5fe]/50 dark:prose-code:bg-slate-700/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none"
        v-html="parsedContent"
      >
      </div>
      
      <div class="mt-16 pt-6 border-t border-dashed border-[#b3e5fc]/50 dark:border-slate-600/50 text-center">
        <span class="inline-flex items-center gap-1.5 text-xs text-[#8aa3bc] dark:text-slate-400 bg-[#f8fafc] dark:bg-slate-800/40 px-3 py-1.5 rounded-full">
          <Sparkles class="w-3 h-3" />
          内容由AI生成
        </span>
      </div>
    </article>
  </div>

  <BackToTop />

  <!-- Copy toast -->
  <div
    v-if="linkCopyMessage"
    class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-black/75 px-5 py-2.5 text-sm text-white shadow-lg"
  >
    {{ linkCopyMessage }}
  </div>

  <!-- 标注工具栏 — 功能未成熟，暂藏 -->
  <!--
  <Teleport to="body">
    <div
      v-if="showAnnoToolbar"
      class="fixed z-[90] flex items-center gap-1 bg-white border border-gray-200 rounded-xl shadow-lg px-2 py-1.5"
      :style="annoToolbarStyle"
    >
      <span class="text-xs text-gray-400 mr-1 flex items-center gap-1">
        <Highlighter class="w-3.5 h-3.5" /> 标注
      </span>
      <button
        v-for="c in HIGHLIGHT_COLORS"
        :key="c.key"
        :class="[c.bg, c.border, 'w-5 h-5 rounded border-2 hover:scale-110 transition-transform']"
        :title="c.label"
        @mousedown.prevent="highlightAnnotation(c.key)"
      />
      <button
        class="flex items-center gap-1 text-xs text-[#0288d1] hover:text-[#01579b] border border-[#81d4fa] rounded-lg px-2 py-0.5 hover:bg-[#e1f5fe] transition-colors"
        title="添加笔记"
        @mousedown.prevent="addNoteToSelection"
      >
        笔记
      </button>
      <button
        class="text-gray-400 hover:text-gray-600 ml-0.5"
        @mousedown.prevent="showAnnoToolbar = false"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </Teleport>
  -->

  <!-- 笔记编辑器 — 功能未成熟，暂藏 -->
  <!--
  <Teleport to="body">
    <div
      v-if="showNoteEditor && editingAnnotation"
      class="anno-note-editor fixed z-[91] bg-white border border-gray-300 rounded-xl shadow-xl p-4 w-80"
      :style="noteEditorStyle"
      @click.stop
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-[#0f4069]">笔记</span>
        <div class="flex items-center gap-1">
          <button
            class="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
            title="删除标注"
            @click="removeAnnotation"
          >
            <Trash2 class="w-4 h-4" />
          </button>
          <button
            class="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
            @click="showNoteEditor = false; editingAnnotation = null"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
      <p class="text-xs text-[#4f6b8a] bg-gray-50 rounded-lg p-2 mb-2 italic line-clamp-3">
        "{{ editingAnnotation.selectedText }}"
      </p>
      <textarea
        v-model="editingNote"
        class="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-[#0288d1] focus:ring-1 focus:ring-[#0288d1]/30"
        rows="3"
        placeholder="添加你的想法..."
        @keydown.escape="showNoteEditor = false; editingAnnotation = null"
      ></textarea>
      <div class="flex justify-end mt-2">
        <button
          class="text-xs bg-[#0288d1] text-white px-4 py-1.5 rounded-lg hover:bg-[#01579b] transition-colors"
          @click="saveNote"
        >
          保存
        </button>
      </div>
    </div>
  </Teleport>
  -->
</template>
