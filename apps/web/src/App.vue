<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { BarChart3, Bot, FileText, Bell, Settings, LogOut, Zap, Cake } from "lucide-vue-next";

import FeedbackPanel from "./components/FeedbackPanel.vue";
import NeuralBackground from "./components/NeuralBackground.vue";
import PageAgentLauncher from "./components/PageAgentLauncher.vue";
import PageAgentPanel from "./components/PageAgentPanel.vue";
import { currentPageAgentContext, getSelectionText } from "./page_agent/context";
import {
  appendAssistantErrorMessage,
  buildPageAgentClientErrorMessage,
  logPageAgentClient,
} from "./page_agent/error_message";
import { type PageAgentConversation, type PageAgentMessage, type PageAgentResponse } from "./page_agent/types";
import {
  askPageAgent,
  canAccessAdminViews,
  createPageAgentConversation,
  getCurrentUser,
  getPageAgentConversationMessages,
  listPageAgentConversations,
  submitFeedback,
} from "./services/api";

const route = useRoute();
const isAgentHovered = ref(false);
const pageAgentOpen = ref(false);
const pageAgentQuestion = ref("");
const pageAgentLoading = ref(false);
const pageAgentMessages = ref<PageAgentMessage[]>([]);
const pageAgentRequestToken = ref(0);
const pageAgentConversationId = ref("");
const pageAgentIntroActive = ref(true);
const pageAgentConversations = ref<PageAgentConversation[]>([]);
const pageAgentConversationsLoading = ref(false);
const feedbackOpen = ref(false);
const feedbackSubmitting = ref(false);
const appMessage = ref("");
const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;
const currentPageTitle = computed(() => document.title || "当前页面");
const currentUser = ref<Awaited<ReturnType<typeof getCurrentUser>>>(null);

const triggerAgent = (): void => {
  pageAgentOpen.value = true;
};

onMounted(async () => {
  window.setTimeout(() => {
    pageAgentIntroActive.value = false;
  }, 1800);

  try {
    currentUser.value = await getCurrentUser();
  } catch {
    currentUser.value = null;
  }
});

const openFeedback = (): void => {
  feedbackOpen.value = true;
};

const handleFeedbackSubmit = async (payload: {
  type: "bug" | "ux" | "content" | "other";
  content: string;
  contact?: string;
}): Promise<void> => {
  feedbackSubmitting.value = true;
  try {
    await submitFeedback({
      ...payload,
      pageRoute: route.fullPath,
      pageTitle: currentPageTitle.value,
    });
    appMessage.value = "反馈已提交，感谢你的建议";
    feedbackOpen.value = false;
  } catch {
    appMessage.value = "反馈提交失败，请稍后重试";
  } finally {
    feedbackSubmitting.value = false;
    window.setTimeout(() => {
      appMessage.value = "";
    }, 3000);
  }
};

const ensurePageAgentConversation = async (): Promise<string> => {
  if (pageAgentConversationId.value) {
    logPageAgentClient("conversation.reuse", {
      conversationId: pageAgentConversationId.value,
      route: currentPageAgentContext.value?.route ?? route.fullPath,
    });
    return pageAgentConversationId.value;
  }
  logPageAgentClient("conversation.create.start", {
    pageType: currentPageAgentContext.value?.pageType ?? "article_list",
    route: currentPageAgentContext.value?.route ?? route.fullPath,
    pageTitle: currentPageAgentContext.value?.pageTitle ?? "当前页面",
  });
  const conversation = await createPageAgentConversation({
    pageType: currentPageAgentContext.value?.pageType ?? "article_list",
    route: currentPageAgentContext.value?.route ?? route.fullPath,
    pageTitle: currentPageAgentContext.value?.pageTitle ?? "当前页面",
  });
  logPageAgentClient("conversation.create.success", {
    conversationId: conversation.id,
  });
  pageAgentConversationId.value = conversation.id;
  return conversation.id;
};

const appendUserMessage = (text: string): void => {
  pageAgentMessages.value = [
    ...pageAgentMessages.value,
    {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    },
  ];
};

const appendAssistantMessage = (result: PageAgentResponse): void => {
  pageAgentMessages.value = [
    ...pageAgentMessages.value,
    {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text: result.answer,
      sources: result.sources,
      meta: result.meta,
    },
  ];
};

const submitPageAgentQuestion = async (): Promise<void> => {
  const text = pageAgentQuestion.value.trim();
  if (!currentPageAgentContext.value || !text) {
    logPageAgentClient("question.skip", {
      hasContext: Boolean(currentPageAgentContext.value),
      questionLength: text.length,
    });
    return;
  }
  const token = Date.now();
  pageAgentRequestToken.value = token;
  appendUserMessage(text);
  pageAgentQuestion.value = "";
  pageAgentLoading.value = true;
  try {
    const conversationId = await ensurePageAgentConversation();
    logPageAgentClient("answer.request.start", {
      conversationId,
      route: currentPageAgentContext.value.route,
      pageType: currentPageAgentContext.value.pageType,
      questionLength: text.length,
    });
    const result = await askPageAgent({
      ...currentPageAgentContext.value,
      conversationId,
      question: text,
      selectionText: getSelectionText(),
    });
    if (pageAgentRequestToken.value !== token) {
      return;
    }
    pageAgentConversationId.value = result.conversationId;
    logPageAgentClient("answer.request.success", {
      conversationId: result.conversationId,
      answerLength: result.answer.length,
      usedHistory: result.meta.usedHistory,
      usedUserProfile: result.meta.usedUserProfile,
      usedSiteSearch: result.meta.usedSiteSearch,
    });
    appendAssistantMessage(result);
  } catch (error) {
    logPageAgentClient("answer.request.failed", {
      error,
      conversationId: pageAgentConversationId.value || undefined,
      route: currentPageAgentContext.value?.route,
    });
    const stage = pageAgentConversationId.value ? "answer" : "conversation";
    pageAgentMessages.value = appendAssistantErrorMessage(
      pageAgentMessages.value,
      buildPageAgentClientErrorMessage(stage, error)
    );
  } finally {
    if (pageAgentRequestToken.value === token) {
      pageAgentLoading.value = false;
    }
  }
};

const copyPageAgentMessage = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

const stopPageAgentRequest = (): void => {
  pageAgentRequestToken.value = Date.now();
  pageAgentLoading.value = false;
};

const loadPageAgentConversations = async (): Promise<void> => {
  if (pageAgentConversationsLoading.value) return;
  pageAgentConversationsLoading.value = true;
  try {
    pageAgentConversations.value = await listPageAgentConversations();
    // Auto-load most recent conversation messages on fresh open (e.g. after page refresh)
    if (pageAgentConversations.value.length > 0 && pageAgentMessages.value.length === 0) {
      try {
        const latestConv = pageAgentConversations.value[0];
        const messages = await getPageAgentConversationMessages(latestConv.id);
        pageAgentMessages.value = messages;
        pageAgentConversationId.value = latestConv.id;
      } catch {
        // Auto-load failed, keep showing conversation list
      }
    }
  } catch {
    // silently fail — non-critical
  } finally {
    pageAgentConversationsLoading.value = false;
  }
};

const selectPageAgentConversation = async (conversationId: string): Promise<void> => {
  pageAgentLoading.value = true;
  try {
    const messages = await getPageAgentConversationMessages(conversationId);
    pageAgentMessages.value = messages;
    pageAgentConversationId.value = conversationId;
  } catch {
    pageAgentMessages.value = [];
  } finally {
    pageAgentLoading.value = false;
  }
};

const resetPageAgentConversation = (): void => {
  pageAgentConversationId.value = "";
  pageAgentMessages.value = [];
  pageAgentQuestion.value = "";
  pageAgentRequestToken.value = Date.now();
  pageAgentLoading.value = false;
};

watch(
  () => route.fullPath,
  () => {
    logPageAgentClient("conversation.reset.on_route_change", {
      fromConversationId: pageAgentConversationId.value || undefined,
      route: route.fullPath,
    });
    // Reset conversation so next question creates a new one,
    // but keep messages visible for cross-page reference
    pageAgentConversationId.value = "";
    pageAgentRequestToken.value = Date.now();
    pageAgentLoading.value = false;
  }
);

const logout = async () => {
  try {
    const response = await fetch(`${apiBase}/auth/logout`, { method: "POST" });
    const data = await response.json();
    if (data.logoutUrl) {
      window.location.href = data.logoutUrl;
    } else {
      window.location.href = `${apiBase}/auth/cas/login`;
    }
  } catch (e) {
    window.location.href = `${apiBase}/auth/cas/login`;
  }
};

const navItems = computed(() => {
  const items = [
    { path: "/", name: "资讯发现", icon: FileText },
    { path: "/subscription", name: "智能订阅", icon: Bell },
  ];

  if (currentUser.value) {
    items.push({ path: "/admin/stats", name: "统计信息", icon: BarChart3 });
  }

  if (canAccessAdminViews(currentUser.value)) {
    items.push(
      { path: "/ai-lab", name: "AI 试验场", icon: Zap },
      { path: "/admin/publish", name: "内容发布", icon: Settings },
      { path: "/admin/birthday", name: "生日推送", icon: Cake }
    );
  }

  return items;
});
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans relative text-[#1e3a5f]">
    <NeuralBackground />
    
    <!-- 顶部导航栏 -->
    <header class="sticky top-0 z-40 glass-panel border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          
          <!-- Logo & Brand -->
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#03a9f4] to-[#0277bd] flex items-center justify-center shadow-[0_0_15px_rgba(2,136,209,0.38)]">
              <Bot class="w-6 h-6 text-white" />
            </div>
            <span class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#0288d1] to-[#01579b] tracking-tight">
              AI徐医
            </span>
          </div>

          <!-- Navigation -->
          <nav class="hidden md:flex items-center gap-1 bg-white/70 p-1 rounded-2xl border border-[#0288d1]/20 backdrop-blur-xl">
            <router-link 
              v-for="item in navItems" 
              :key="item.path" 
              :to="item.path"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
              :class="route.path === item.path ? 'bg-[#b3e5fc]/70 text-[#01579b] shadow-sm border border-[#0288d1]/25' : 'text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] border border-transparent'"
            >
              <component :is="item.icon" class="w-4 h-4" />
              {{ item.name }}
            </router-link>
          </nav>

          <!-- Actions -->
          <div class="flex items-center gap-3">
            <router-link
              to="/profile"
              class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-[#e1f5fe] text-[#4f6b8a] hover:text-[#01579b]"
              title="个人中心"
            >
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-[#0288d1] to-[#01579b] flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                {{ currentUser?.displayName?.charAt(0) || "U" }}
              </div>
              <span class="hidden sm:inline max-w-[6rem] truncate">{{ currentUser?.displayName || "个人中心" }}</span>
            </router-link>
            <button @click="logout" class="p-2 text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] rounded-xl transition-colors" title="退出登录">
              <LogOut class="w-5 h-5" />
            </button>
          </div>

        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <KeepAlive include="ArticlesPage">
            <component :is="Component" />
          </KeepAlive>
        </transition>
      </router-view>
    </main>

    <!-- 底部悬浮 AI 助手入口 -->
    <PageAgentPanel
      :visible="pageAgentOpen"
      :loading="pageAgentLoading"
      :question="pageAgentQuestion"
      :messages="pageAgentMessages"
      :conversations="pageAgentConversations"
      :loading-conversations="pageAgentConversationsLoading"
      @close="pageAgentOpen = false; pageAgentConversations = []"
      @submit="submitPageAgentQuestion"
      @stop="stopPageAgentRequest"
      @copy="copyPageAgentMessage"
      @update:question="pageAgentQuestion = $event"
      @load-conversations="loadPageAgentConversations"
      @select-conversation="selectPageAgentConversation"
      @new-conversation="resetPageAgentConversation"
    />

    <PageAgentLauncher
      :is-hovered="isAgentHovered"
      :intro-active="pageAgentIntroActive"
      @click="triggerAgent"
      @mouseenter="isAgentHovered = true"
      @mouseleave="isAgentHovered = false"
    />

    <button
      type="button"
      class="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-2xl border border-r-0 border-[#b3e5fc] bg-white/92 px-2 py-4 text-sm font-medium text-[#0f4069] shadow-[0_10px_24px_-18px_rgba(15,64,105,0.45)] transition-all duration-300 hover:-translate-x-1 hover:bg-white"
      style="writing-mode: vertical-rl; text-orientation: mixed;"
      @click="openFeedback"
    >
      意见反馈
    </button>

    <FeedbackPanel
      :visible="feedbackOpen"
      :page-route="route.fullPath"
      :page-title="currentPageTitle"
      :submitting="feedbackSubmitting"
      @close="feedbackOpen = false"
      @submit="handleFeedbackSubmit"
    />

    <div
      v-if="appMessage"
      class="fixed bottom-28 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)]"
    >
      {{ appMessage }}
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(15px);
}
</style>
