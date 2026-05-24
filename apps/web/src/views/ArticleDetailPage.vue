<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Clock, User, Hash, Sparkles, Link } from "lucide-vue-next";

import { buildArticleDetailContext, setPageAgentContext } from "../page_agent/context";
import {
  getArticle,
  reportArticleView,
  checkFavorite,
  addFavorite,
  removeFavorite,
  reportReadingHistory,
  type Article,
} from "../services/api";
import { renderMarkdown } from "../shared/markdown";
import BackToTop from "../components/BackToTop.vue";

const route = useRoute();
const router = useRouter();
const item = ref<Article | null>(null);
const loading = ref(false);
const isFavorited = ref(false);
const favoriting = ref(false);

const parsedContent = computed(() => {
  if (!item.value?.content) return "";
  return renderMarkdown(item.value.content);
});

const parsedSummary = computed(() => {
  if (!item.value?.summary) return "";
  return renderMarkdown(item.value.summary);
});

const load = async (): Promise<void> => {
  console.info("[ArticleDetailPage] 加载文章详情", { id: route.params.id?.toString() ?? "" });
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
  } catch {
    // silent
  } finally {
    favoriting.value = false;
  }
};

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

onMounted(() => {
  load();
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

onBeforeUnmount(() => {
  setPageAgentContext(null);
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 pb-12">
    <button @click="router.back()" class="flex items-center gap-2 text-[#4f6b8a] hover:text-[#01579b] transition-colors">
      <ArrowLeft class="w-4 h-4" />
      返回列表
    </button>

    <div v-if="loading" class="flex items-center justify-center py-32">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0288d1]"></div>
    </div>

    <div v-else-if="!item" class="glass-card py-20 text-center">
      <h3 class="text-xl font-medium text-[#4f6b8a]">文章不存在或已被删除</h3>
    </div>

    <article v-else class="glass-panel rounded-3xl p-8 md:p-12 border shadow-sm">
      <header class="mb-10 text-center border-b border-[#b3e5fc]/50 pb-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <span class="badge-ai !bg-[#e1f5fe] !text-[#0277bd]">{{ item.category }}</span>
        </div>
        
        <div class="flex items-center justify-center gap-3 mb-5">
          <h1 class="text-3xl md:text-4xl font-bold text-[#0f4069] leading-tight tracking-tight font-serif">
            {{ item.title }}
          </h1>
          <button
            type="button"
            class="shrink-0 rounded-xl p-2 transition-all duration-300"
            :class="isFavorited ? 'text-[#f59e0b] hover:text-[#d97706] bg-[#fef3c7]/60 hover:bg-[#fef3c7]' : 'text-[#b3e5fc] hover:text-[#f59e0b] hover:bg-[#fef3c7]/40'"
            :title="isFavorited ? '取消收藏' : '收藏'"
            :disabled="favoriting"
            @click="toggleFavorite"
          >
            <svg v-if="isFavorited" class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <svg v-else class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2zm0 2.46L9.91 9.23 5.13 10.08l4.07 3.97-.96 5.6L12 17.29l3.76 1.98-.96-5.6 4.07-3.97-4.78-.85L12 4.46z"/></svg>
          </button>
        </div>
        
        <div v-if="item.tags && item.tags.length" class="flex flex-wrap items-center justify-center gap-2 mb-6">
          <span v-for="tag in item.tags" :key="tag" class="text-xs text-[#0288d1] bg-[#e1f5fe]/80 px-2.5 py-1 rounded-full flex items-center border border-[#81d4fa]/30">
            <Hash class="w-3 h-3 mr-0.5 opacity-70" />{{ tag }}
          </span>
        </div>
        
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-[#4f6b8a]">
          <span class="flex items-center gap-1.5">
            <User class="w-4 h-4 text-[#0288d1]/70" />
            {{ item.author }}
          </span>
          <span class="flex items-center gap-1.5">
            <Clock class="w-4 h-4 text-[#0288d1]/70" />
            {{ formatDate(item.publishedAt) }}
          </span>
          <a
            v-if="item.originalUrl"
            :href="item.originalUrl"
            class="flex items-center gap-1 text-xs text-[#0288d1] hover:text-[#01579b] hover:underline transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
             <Link class="w-3.5 h-3.5 opacity-80" />
             查看原文
             <span class="text-[10px] text-[#8aa3bc] font-normal">（外部链接）</span>
          </a>
          <span v-else class="flex items-center gap-1.5 text-[#8aa3bc]">
            <Link class="w-4 h-4 opacity-60" />
            未提供原文链接
          </span>
        </div>
      </header>

      <div class="bg-gradient-to-br from-[#e1f5fe] to-[#f1faff] border border-[#81d4fa]/60 rounded-2xl p-6 md:p-8 mb-12 shadow-sm">
        <div class="flex items-center gap-2 text-[#0288d1] font-semibold mb-4 text-lg">
          <Sparkles class="w-5 h-5" />
          AI 核心摘要
        </div>
        <div
          class="prose prose-slate max-w-none text-[#355878] text-lg leading-relaxed font-serif
                 prose-headings:text-[#0f4069] prose-p:my-3 prose-ul:my-3 prose-ol:my-3
                 prose-a:text-[#0288d1] hover:prose-a:text-[#01579b]"
          v-html="parsedSummary"
        ></div>
      </div>

      <!-- Markdown Content rendering with tailwind typography styles manually applied for better fonts -->
      <div 
        class="prose prose-slate prose-lg max-w-none text-[#355878] leading-loose font-serif
               prose-headings:text-[#0f4069] prose-headings:font-bold prose-headings:tracking-tight
               prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-5 prose-h2:border-b prose-h2:border-[#b3e5fc]/30 prose-h2:pb-2
               prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4
               prose-p:mb-6 prose-p:text-[17px]
               prose-a:text-[#0288d1] hover:prose-a:text-[#01579b] prose-a:no-underline hover:prose-a:underline
               prose-strong:text-[#0f4069] prose-strong:font-semibold
               prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-6 prose-ul:space-y-2
               prose-ol:list-decimal prose-ol:pl-6 prose-ol:mb-6 prose-ol:space-y-2
               prose-li:text-[17px] prose-li:marker:text-[#81d4fa]
               prose-blockquote:border-l-4 prose-blockquote:border-[#81d4fa] prose-blockquote:pl-5 prose-blockquote:italic prose-blockquote:text-[#4f6b8a] prose-blockquote:bg-[#f1faff] prose-blockquote:py-1 prose-blockquote:rounded-r-lg
               prose-code:text-[#0288d1] prose-code:bg-[#e1f5fe]/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none"
        v-html="parsedContent"
      >
      </div>
      
      <div class="mt-16 pt-6 border-t border-dashed border-[#b3e5fc]/50 text-center">
        <span class="inline-flex items-center gap-1.5 text-xs text-[#8aa3bc] bg-[#f8fafc] px-3 py-1.5 rounded-full">
          <Sparkles class="w-3 h-3" />
          内容由AI生成
        </span>
      </div>
    </article>
  </div>

  <BackToTop />
</template>
