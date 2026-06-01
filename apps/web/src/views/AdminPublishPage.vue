<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { Sparkles, Rocket, Edit3, RefreshCw, ListChecks, Filter, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useRoute } from "vue-router";
import {
  createArticle,
  deleteArticle,
  extractArticleFromUrl,
  listArticles,
  listChannels,
  optimizeArticleDraftByAi,
  summarizeByAiXy,
  updateArticle,
  getCurrentUser,
  type Article,
  type ArticleAiOptimizeResult,
  type Channel,
} from "../services/api";
import { buildAdminContext, setPageAgentContext } from "../page_agent/context";
import { renderMarkdown } from "../shared/markdown";

const title = ref("");
const channelCode = ref("");
const content = ref("");
const summary = ref("");
const sourceContentDraft = ref("");
const authorName = ref("");
const originalUrl = ref("");
const extractUrl = ref("");
const publishedAt = ref("");
const status = ref<"draft" | "published">("draft");
const message = ref("");
const route = useRoute();
const loadingAI = ref(false);
const loadingExtract = ref(false);
const loadingSave = ref(false);
const loadingList = ref(false);
const loadingBatch = ref(false);
const loadingAiOptimize = ref(false);
const channels = ref<Channel[]>([]);
const articles = ref<Article[]>([]);
const currentUserId = ref("");
const accessDenied = ref(false);
const selectedArticleIds = ref<string[]>([]);
const aiPreview = ref<ArticleAiOptimizeResult | null>(null);
const editingArticleId = ref("");

// Pagination and Filtering
const filterChannel = ref("");
const currentPage = ref(1);
const pageSize = 10;

const resolveChannelName = (code: string): string =>
  channels.value.find((item) => item.code === code)?.name ?? code;

const filteredArticles = computed(() => {
  let result = articles.value;
  if (filterChannel.value) {
    result = result.filter(a => a.channelCode === filterChannel.value);
  }
  return result;
});

const totalPages = computed(() => Math.ceil(filteredArticles.value.length / pageSize));

const paginatedArticles = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return filteredArticles.value.slice(start, end);
});

const paginatedArticleIds = computed(() => paginatedArticles.value.map((item) => item.id));

const allCurrentPageSelected = computed(
  () =>
    paginatedArticleIds.value.length > 0 &&
    paginatedArticleIds.value.every((id) => selectedArticleIds.value.includes(id))
);

const selectedCount = computed(() => selectedArticleIds.value.length);
const canOptimizeContent = computed(() => content.value.trim().length > 0);
const showContentPreview = computed(() => content.value.trim().length > 0);
const contentPreviewTitle = computed(() =>
  sourceContentDraft.value.trim() ? "提取结果预览" : "正文预览"
);
const contentPreviewHtml = computed(() => renderMarkdown(content.value));
const isEditing = computed(() => editingArticleId.value.length > 0);
const editingArticle = computed(
  () => articles.value.find((item) => item.id === editingArticleId.value) ?? null
);

const clearSelection = (): void => {
  selectedArticleIds.value = [];
};

const handleFilterChange = () => {
  currentPage.value = 1;
  clearSelection();
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};

const checkAccess = async (): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    const allowList = new Set(["100002013029"]);
    const userId = user?.id?.trim() ?? "";
    const username = user?.username?.trim() ?? "";
    currentUserId.value = userId || username;
    if (!user || (!allowList.has(userId) && !allowList.has(username))) {
      message.value = "无权限访问内容发布，请联系管理员开通";
      accessDenied.value = true;
      return false;
    }
    accessDenied.value = false;
    return true;
  } catch {
    message.value = "用户信息获取失败，请重新登录后重试";
    accessDenied.value = true;
    return false;
  }
};

const loadChannels = async (): Promise<void> => {
  channels.value = await listChannels();
  if (!channelCode.value && channels.value.length > 0) {
    channelCode.value = channels.value[0].code;
  }
};

const loadArticles = async (): Promise<void> => {
  loadingList.value = true;
  try {
    // Fetch all statuses
    articles.value = await listArticles({ status: undefined });
    selectedArticleIds.value = selectedArticleIds.value.filter((id) =>
      articles.value.some((item) => item.id === id)
    );
  } finally {
    loadingList.value = false;
  }
};

const toggleArticleSelection = (id: string): void => {
  if (selectedArticleIds.value.includes(id)) {
    selectedArticleIds.value = selectedArticleIds.value.filter((item) => item !== id);
    return;
  }
  selectedArticleIds.value = [...selectedArticleIds.value, id];
};

const toggleCurrentPageSelection = (): void => {
  if (allCurrentPageSelected.value) {
    selectedArticleIds.value = selectedArticleIds.value.filter(
      (id) => !paginatedArticleIds.value.includes(id)
    );
    return;
  }
  selectedArticleIds.value = [...new Set([...selectedArticleIds.value, ...paginatedArticleIds.value])];
};

const clearForm = (): void => {
  editingArticleId.value = "";
  title.value = "";
  content.value = "";
  summary.value = "";
  sourceContentDraft.value = "";
  authorName.value = "";
  originalUrl.value = "";
  extractUrl.value = "";
  publishedAt.value = "";
  channelCode.value = channels.value[0]?.code ?? "";
  status.value = "draft";
  aiPreview.value = null;
};

const fillFormForEdit = (item: Article): void => {
  editingArticleId.value = item.id;
  title.value = item.title;
  content.value = item.content;
  summary.value = item.summary;
  sourceContentDraft.value = item.sourceContent ?? "";
  authorName.value = item.author;
  originalUrl.value = item.originalUrl ?? "";
  extractUrl.value = item.originalUrl ?? "";
  publishedAt.value = item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 16) : "";
  channelCode.value = item.channelCode;
  status.value = item.status;
  aiPreview.value = null;
  message.value = `已载入《${item.title}》进行编辑`;
  setTimeout(() => (message.value = ""), 3000);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const generateSummary = async (): Promise<void> => {
  if (!content.value.trim()) {
    message.value = "请先输入正文内容";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  loadingAI.value = true;
  console.info("[AdminPage] 请求 AI 摘要", { contentLength: content.value.length });
  try {
    summary.value = await summarizeByAiXy(content.value);
  } catch {
    message.value = "AI 生成失败，请重试";
  } finally {
    loadingAI.value = false;
  }
};

const handleExtract = async (): Promise<void> => {
  const targetUrl = extractUrl.value.trim();
  if (!targetUrl) {
    message.value = "请输入有效的 URL";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  loadingExtract.value = true;
  try {
    const result = await extractArticleFromUrl(targetUrl);
    extractUrl.value = result.originalUrl;
    originalUrl.value = result.originalUrl;
    if (result.title) {
      title.value = result.title;
    }
    if (result.content) {
      content.value = result.content;
    }
    sourceContentDraft.value = result.sourceContent ?? "";
    if (result.summary) {
      summary.value = result.summary;
    }
    if (result.author) {
      authorName.value = result.author;
    }
    if (result.channelCode) {
      channelCode.value = result.channelCode;
    }
    if (result.publishedAt) {
      publishedAt.value = new Date(result.publishedAt).toISOString().slice(0, 16);
    }
    message.value = "内容提取完成";
    setTimeout(() => (message.value = ""), 3000);
  } catch (error: any) {
    message.value = error.response?.data?.message || "自动提取失败";
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loadingExtract.value = false;
  }
};

const normalizePublishedAt = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
};

const normalizeOptionalText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed || undefined;
};

const handleAiOptimize = async (): Promise<void> => {
  if (!content.value.trim()) {
    return;
  }
  loadingAiOptimize.value = true;
  try {
    aiPreview.value = await optimizeArticleDraftByAi({
      title: title.value.trim() || undefined,
      content: content.value,
      summary: summary.value.trim() || undefined,
      channelCode: channelCode.value || undefined,
      originalUrl: originalUrl.value.trim() || undefined,
    });
  } catch (error: any) {
    message.value = error.response?.data?.message || "AI 优化失败，请重试";
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loadingAiOptimize.value = false;
  }
};

const applyAiPreview = (): void => {
  if (!aiPreview.value) {
    return;
  }
  if (aiPreview.value.suggestedTitle) {
    title.value = aiPreview.value.suggestedTitle;
  }
  if (aiPreview.value.suggestedSummary) {
    summary.value = aiPreview.value.suggestedSummary;
  }
  if (aiPreview.value.suggestedChannelCode) {
    channelCode.value = aiPreview.value.suggestedChannelCode;
  }
  if (aiPreview.value.optimizedContent) {
    content.value = aiPreview.value.optimizedContent;
  }
  aiPreview.value = null;
};

const dismissAiPreview = (): void => {
  aiPreview.value = null;
};

const submit = async (): Promise<void> => {
  const editingId = editingArticleId.value;
  if (!title.value.trim() || !content.value.trim() || !channelCode.value) {
    message.value = "标题、栏目和正文不能为空";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  loadingSave.value = true;
  console.info("[AdminPage] 提交文章", { channelCode: channelCode.value, status: status.value });
  try {
    const payload = {
      title: title.value.trim(),
      channelCode: channelCode.value,
      content: content.value.trim(),
      summary: normalizeOptionalText(summary.value),
      sourceContent: normalizeOptionalText(sourceContentDraft.value),
      authorName: normalizeOptionalText(authorName.value),
      originalUrl: normalizeOptionalText(originalUrl.value),
      publishedAt: normalizePublishedAt(publishedAt.value),
      status: status.value,
      tags: [],
    };
    if (editingId) {
      await updateArticle(editingId, payload);
      message.value = "文章已更新";
      clearForm();
    } else {
      await createArticle(payload);
      message.value = "内容已成功提交";
      if (status.value === "published") {
        clearForm();
      }
    }
    setTimeout(() => (message.value = ""), 3000);
    await loadArticles();
  } catch (error: any) {
    message.value = error.response?.data?.message || "提交失败";
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loadingSave.value = false;
  }
};

const submitDraft = async (): Promise<void> => {
  const previous = status.value;
  status.value = "draft";
  try {
    await submit();
  } finally {
    status.value = previous;
  }
};

const submitAsPublished = async (): Promise<void> => {
  const previous = status.value;
  status.value = "published";
  try {
    await submit();
  } finally {
    status.value = previous;
  }
};

const toggleArticleStatus = async (item: Article): Promise<void> => {
  const nextStatus = item.status === "published" ? "draft" : "published";
  try {
    await updateArticle(item.id, { status: nextStatus });
    await loadArticles();
  } catch (error: any) {
    message.value = error.response?.data?.message || "状态更新失败";
    setTimeout(() => (message.value = ""), 3000);
  }
};

const removeArticle = async (item: Article): Promise<void> => {
  if (!window.confirm(`确认删除《${item.title}》吗？`)) {
    return;
  }
  try {
    await deleteArticle(item.id);
    message.value = "文章已删除";
    setTimeout(() => (message.value = ""), 3000);
    await loadArticles();
  } catch (error: any) {
    message.value = error.response?.data?.message || "删除失败";
    setTimeout(() => (message.value = ""), 3000);
  }
};

const runBatchAction = async (
  action: () => Promise<PromiseSettledResult<unknown>[]>,
  successLabel: string,
  failureLabel: string
): Promise<void> => {
  if (selectedArticleIds.value.length === 0) {
    message.value = "请先选择文章";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  loadingBatch.value = true;
  try {
    const results = await action();
    const successCount = results.filter((item) => item.status === "fulfilled").length;
    const failureCount = results.length - successCount;
    message.value =
      failureCount === 0
        ? `${successLabel}${successCount}篇文章`
        : `${successLabel}${successCount}篇，${failureLabel}${failureCount}篇`;
    setTimeout(() => (message.value = ""), 3000);
    await loadArticles();
    clearSelection();
  } catch (error: any) {
    message.value = error.response?.data?.message || `${failureLabel}失败`;
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loadingBatch.value = false;
  }
};

const batchUpdateStatus = async (nextStatus: "draft" | "published"): Promise<void> => {
  await runBatchAction(
    () =>
      Promise.allSettled(
        selectedArticleIds.value.map((id) => updateArticle(id, { status: nextStatus }))
      ),
    nextStatus === "published" ? "已发布" : "已转草稿",
    nextStatus === "published" ? "发布失败" : "转草稿失败"
  );
};

const batchDeleteArticles = async (): Promise<void> => {
  if (selectedArticleIds.value.length === 0) {
    message.value = "请先选择文章";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  if (!window.confirm(`确认删除已选择的${selectedArticleIds.value.length}篇文章吗？`)) {
    return;
  }
  await runBatchAction(
    () => Promise.allSettled(selectedArticleIds.value.map((id) => deleteArticle(id))),
    "已删除",
    "删除失败"
  );
};

onMounted(async () => {
  const hasAccess = await checkAccess();
  if (hasAccess) {
    await Promise.all([loadChannels(), loadArticles()]);
  }
});

watchEffect(() => {
  setPageAgentContext(
    buildAdminContext({
      route: route.fullPath,
      pageTitle: "内容发布",
      extractUrl: extractUrl.value,
      titleDraft: title.value,
      summaryDraft: summary.value,
      channelCode: channelCode.value,
      publishedAt: publishedAt.value,
      filterChannel: filterChannel.value,
      selectedCount: selectedCount.value,
      items: paginatedArticles.value.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        channelCode: item.channelCode,
      })),
    })
  );
});

onBeforeUnmount(() => {
  setPageAgentContext(null);
});
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold text-[#0f4069] flex items-center gap-3">
          <Edit3 class="w-8 h-8 text-[#0288d1]" />
          内容发布
        </h1>
        <p class="text-[#4f6b8a] mt-2">管理员可在当前页面完成栏目选择、文章发布与文章状态管理</p>
      </div>
    </div>

    <section
      v-if="accessDenied"
      class="glass-panel rounded-2xl border p-8 text-center"
    >
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="text-[#4f6b8a] mt-2">
        当前账号（{{ currentUserId || "未知用户" }}）不在内容发布允许名单内。
      </p>
    </section>


    <!-- Redesigned Top Area -->
    <div v-if="!accessDenied" class="glass-panel p-6 md:p-8 rounded-3xl border shadow-sm">
      <div class="flex flex-col md:flex-row gap-6">
        <div class="flex-1 space-y-5">
          <div class="space-y-2">
            <label class="text-sm font-medium text-[#4f6b8a]" title="URL：统一资源定位符（网页链接地址）">文章来源 URL</label>
            <div
              v-if="isEditing"
              class="flex items-center justify-between gap-3 rounded-2xl border border-[#81d4fa] bg-[#e1f5fe]/70 px-4 py-3 text-sm text-[#0f4069]"
            >
              <span class="min-w-0 truncate">
                正在编辑：{{ editingArticle?.title || "当前文章" }}
              </span>
              <button type="button" class="btn-secondary !py-2 text-xs" @click="clearForm">
                取消编辑
              </button>
            </div>
            <div class="flex gap-2">
              <input
                v-model="extractUrl"
                type="url"
                class="input-ai flex-1"
                placeholder="https://example.com/article"
              />
              <button
                type="button"
                class="btn-secondary whitespace-nowrap"
                :disabled="loadingExtract || loadingSave"
                @click="handleExtract"
              >
                {{ loadingExtract ? "提取中..." : "自动提取" }}
              </button>
              <button
                type="button"
                class="btn-secondary whitespace-nowrap"
                :disabled="loadingExtract || loadingSave"
                @click="clearForm"
              >
                一键清除
              </button>
            </div>
          </div>
          <input
            v-model="title"
            class="w-full bg-transparent border-b-2 border-[#b3e5fc] px-2 py-3 text-2xl font-bold text-[#0f4069] placeholder:text-[#8aa3bc] focus:outline-none focus:border-[#0288d1] transition-colors"
            placeholder="输入文章标题"
          />
          <textarea
            v-model="content"
            rows="10"
            class="w-full bg-white border border-[#81d4fa]/70 rounded-xl p-4 text-[#355878] leading-relaxed resize-none focus:outline-none focus:border-[#0288d1]/70 transition-colors"
            placeholder="正文内容..."
          ></textarea>
          <div
            v-if="showContentPreview"
            class="rounded-2xl border border-[#d8edf9] bg-white/85 p-4"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-[#0f4069]">{{ contentPreviewTitle }}</p>
                <p class="text-xs text-[#6e89a3]">
                  这里显示当前正文的实际 <span title="Markdown：轻量级标记语言，用纯文本符号（如 ##、**）标记标题、加粗等格式">Markdown</span> 效果，便于检查标题层级和重点强化。
                </p>
              </div>
            </div>
            <div
              class="prose prose-slate max-w-none text-sm leading-relaxed text-[#355878]
                     prose-headings:text-[#0f4069] prose-strong:text-[#0f4069] prose-ul:pl-6 prose-ol:pl-6"
              v-html="contentPreviewHtml"
            ></div>
          </div>
        </div>
        
        <div class="w-full md:w-80 space-y-5 flex flex-col">
          <div class="space-y-2">
            <label class="text-sm font-medium text-[#4f6b8a]">栏目</label>
            <select v-model="channelCode" class="input-ai">
              <option v-for="item in channels" :key="item.code" :value="item.code">{{ item.name }}</option>
            </select>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-[#4f6b8a]">原文链接</label>
            <input
              v-model="originalUrl"
              type="url"
              class="input-ai"
              placeholder="https://example.com/article"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-[#4f6b8a]">发布时间</label>
            <input
              v-model="publishedAt"
              type="datetime-local"
              class="input-ai"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-[#4f6b8a]">作者</label>
            <input
              v-model="authorName"
              type="text"
              class="input-ai"
              placeholder="优先自动提取来源作者"
            />
          </div>
          <div class="space-y-2 flex-1 flex flex-col">
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium text-[#4f6b8a]">摘要</label>
              <button
                @click="generateSummary"
                :disabled="loadingAI || loadingExtract"
                class="text-xs text-[#0288d1] hover:text-[#01579b] flex items-center gap-1 disabled:opacity-50"
              >
                <Sparkles class="w-3 h-3" :class="{ 'animate-spin': loadingAI }" />
                {{ loadingAI ? "提炼中..." : "AI 提炼" }}
              </button>
            </div>
            <textarea v-model="summary" class="input-ai text-sm leading-relaxed flex-1 min-h-[100px]"></textarea>
          </div>

          <div class="flex flex-col gap-3 mt-auto">
            <button
              @click="submitAsPublished"
              :disabled="loadingSave || loadingExtract"
              class="w-full btn-primary flex items-center justify-center gap-2 py-3 shadow-lg shadow-[#0288d1]/20"
            >
              <Rocket class="w-5 h-5" />
              <span v-if="loadingSave">处理中...</span>
              <span v-else>{{ isEditing ? "更新并发布" : "一键发布" }}</span>
            </button>
            <button
              type="button"
              v-if="canOptimizeContent"
              @click="handleAiOptimize"
              :disabled="loadingAiOptimize || loadingSave || loadingExtract"
              class="w-full btn-secondary py-3"
            >
              {{ loadingAiOptimize ? "优化中..." : "AI 优化建议" }}
            </button>
            <button
              type="button"
              @click="submitDraft"
              :disabled="loadingSave || loadingExtract"
              class="w-full btn-secondary py-3"
            >
              {{ isEditing ? "更新草稿" : "保存为草稿" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <section
      v-if="!accessDenied && aiPreview"
      class="glass-panel rounded-3xl border border-[#b3e5fc] p-6 md:p-8 shadow-sm"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h3 class="text-lg font-semibold text-[#0f4069]">AI 优化预览</h3>
        <span class="text-xs text-[#6e89a3]">
          {{ aiPreview.notes || "请确认后再应用到表单" }}
        </span>
      </div>

      <div class="mt-5 space-y-4 text-sm text-[#355878]">
        <div v-if="aiPreview.suggestedTitle">
          <p class="mb-1 text-xs text-[#6e89a3]">建议标题</p>
          <p class="rounded-2xl bg-white/80 px-4 py-3">{{ aiPreview.suggestedTitle }}</p>
        </div>
        <div v-if="aiPreview.suggestedSummary">
          <p class="mb-1 text-xs text-[#6e89a3]">建议摘要</p>
          <p class="rounded-2xl bg-white/80 px-4 py-3">{{ aiPreview.suggestedSummary }}</p>
        </div>
        <div v-if="aiPreview.suggestedChannelCode">
          <p class="mb-1 text-xs text-[#6e89a3]">建议栏目</p>
          <p class="rounded-2xl bg-white/80 px-4 py-3">
            {{ resolveChannelName(aiPreview.suggestedChannelCode) }}
          </p>
        </div>
        <div v-if="aiPreview.optimizedContent">
          <p class="mb-1 text-xs text-[#6e89a3]">优化后正文</p>
          <div
            class="prose prose-slate max-w-none rounded-2xl border border-[#d8edf9] bg-white/80 p-4 text-sm leading-relaxed text-[#355878]
                   prose-headings:text-[#0f4069] prose-strong:text-[#0f4069] prose-ul:pl-6 prose-ol:pl-6"
            v-html="renderMarkdown(aiPreview.optimizedContent)"
          ></div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-3">
        <button type="button" class="btn-secondary" @click="dismissAiPreview">取消</button>
        <button type="button" class="btn-primary" @click="applyAiPreview">应用到表单</button>
      </div>
    </section>

    <section v-if="!accessDenied" class="glass-panel rounded-3xl p-6 md:p-8 border shadow-sm">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <h2 class="text-lg font-semibold text-[#0f4069] flex items-center gap-2">
          <ListChecks class="w-5 h-5 text-[#0288d1]" />
          文章管理
        </h2>
        <div class="flex flex-col md:flex-row items-start md:items-center gap-3 w-full md:w-auto">
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 text-sm text-[#4f6b8a]">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-[#81d4fa] text-[#0288d1] focus:ring-[#0288d1]"
                :checked="allCurrentPageSelected"
                @change="toggleCurrentPageSelection"
              />
              当前页全选
            </label>
            <span class="text-sm text-[#4f6b8a]">已选 {{ selectedCount }} 篇</span>
            <button
              type="button"
              class="btn-secondary !py-2 text-sm"
              :disabled="selectedCount === 0 || loadingBatch"
              @click="batchUpdateStatus('published')"
            >
              一键发布
            </button>
            <button
              type="button"
              class="btn-secondary !py-2 text-sm"
              :disabled="selectedCount === 0 || loadingBatch"
              @click="batchUpdateStatus('draft')"
            >
              转为草稿
            </button>
            <button
              type="button"
              class="text-sm shrink-0 whitespace-nowrap rounded-lg border border-red-200 px-3 py-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="selectedCount === 0 || loadingBatch"
              @click="batchDeleteArticles"
            >
              删除
            </button>
          </div>
          <div class="relative flex-1 md:w-48">
            <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0288d1]" />
            <select v-model="filterChannel" @change="handleFilterChange" class="input-ai pl-9 !py-2 text-sm appearance-none">
              <option value="">全部栏目</option>
              <option v-for="item in channels" :key="item.code" :value="item.code">{{ item.name }}</option>
            </select>
          </div>
          <button type="button" class="btn-secondary flex items-center gap-2 !py-2 shrink-0" @click="loadArticles">
            <RefreshCw class="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      <div v-if="loadingList" class="text-sm text-[#4f6b8a] py-8 text-center">加载中...</div>
      <div v-else-if="filteredArticles.length === 0" class="text-sm text-[#4f6b8a] py-8 text-center">暂无文章</div>
      <div v-else class="space-y-3">
        <div
          v-for="item in paginatedArticles"
          :key="item.id"
          class="bg-white/85 border border-[#b3e5fc] hover:border-[#4fc3f7] transition-colors rounded-xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-[#81d4fa] text-[#0288d1] focus:ring-[#0288d1]"
              :checked="selectedArticleIds.includes(item.id)"
              @change="toggleArticleSelection(item.id)"
            />
          </div>
          <div class="min-w-0 flex-1">
            <router-link :to="'/articles/' + item.id" class="block group">
              <p class="text-[15px] font-semibold text-[#0f4069] group-hover:text-[#0288d1] truncate transition-colors">{{ item.title }}</p>
            </router-link>
            <div class="flex items-center flex-wrap gap-2 text-xs text-[#4f6b8a] mt-2">
              <span class="bg-[#e1f5fe] px-2 py-0.5 rounded text-[#0277bd]">{{ resolveChannelName(item.channelCode) }}</span>
              <span>作者：{{ item.author }}</span>
              <span :class="item.status === 'published' ? 'text-green-600' : 'text-orange-500'">
                状态：{{ item.status === "published" ? "已发布" : "草稿" }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              class="btn-secondary text-xs whitespace-nowrap"
              @click="fillFormForEdit(item)"
            >
              编辑
            </button>
            <button
              type="button"
              class="btn-secondary text-xs whitespace-nowrap"
              @click="toggleArticleStatus(item)"
            >
              {{ item.status === "published" ? "转为草稿" : "设为发布" }}
            </button>
            <button
              type="button"
              class="text-xs shrink-0 whitespace-nowrap rounded-lg border border-red-200 px-3 py-2 text-red-600 transition-colors hover:bg-red-50"
              @click="removeArticle(item)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-between pt-6 border-t border-[#b3e5fc]/50 mt-6">
          <p class="text-sm text-[#4f6b8a]">
            共 <span class="font-medium text-[#0f4069]">{{ filteredArticles.length }}</span> 条记录
          </p>
          <div class="flex items-center gap-2">
            <button 
              @click="prevPage" 
              :disabled="currentPage === 1"
              class="p-1.5 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <span class="text-sm text-[#0f4069] font-medium px-2">{{ currentPage }} / {{ totalPages }}</span>
            <button 
              @click="nextPage" 
              :disabled="currentPage === totalPages"
              class="p-1.5 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <transition name="fade">
      <div
        v-if="message"
        class="fixed right-6 bottom-6 z-50 max-w-sm text-sm font-medium text-[#0277bd] bg-[#e1f5fe] px-4 py-3 rounded-xl border border-[#81d4fa] shadow-lg shadow-[#0288d1]/15"
      >
        {{ message }}
      </div>
    </transition>
  </div>
</template>
