<script setup lang="ts">
import { computed, onActivated, onDeactivated, onErrorCaptured, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { BarChart3, Bot, ChevronDown, FileText, Bell, LayoutDashboard, Settings, LogOut, Zap, ClipboardCheck, MessageSquare, Moon, Sun, Trophy, Star } from "lucide-vue-next";

import BackToTop from "./components/BackToTop.vue";
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
import { type PageAgentConversation, type PageAgentMessage } from "./page_agent/types";
import {
  askPageAgentStream,
  canAccessAdminViews,
  createPageAgentConversation,
  getPageAgentConversationMessages,
  listPageAgentConversations,
  submitFeedback,
  updatePageAgentConversationTitle,
} from "./services/api";

import { useDarkMode } from "./composables/useDarkMode";
import { useFontScale } from "./composables/useFontScale";

const { isDark, toggle: toggleDark } = useDarkMode();
const { fontScale, SCALES, setScale } = useFontScale();
const route = useRoute();
const isAgentHovered = ref(false);
const adminDropdownOpen = ref(false);
const pageAgentOpen = ref(false);
const pageAgentQuestion = ref("");
const pageAgentLoading = ref(false);
const pageAgentMessages = ref<PageAgentMessage[]>([]);
const pageAgentRequestToken = ref(0);
const pageAgentStreamController = ref<AbortController | null>(null);
const pageAgentConversationId = ref("");
const pageAgentIntroActive = ref(true);
const pageAgentConversations = ref<PageAgentConversation[]>([]);
const pageAgentConversationsLoading = ref(false);
const pageAgentConversationsHasMore = ref(false);
const pageAgentTitleSet = ref(false);
const pageAgentVerbosity = ref<"concise" | "detailed">("concise");
const feedbackOpen = ref(false);
const feedbackSubmitting = ref(false);
const appMessage = ref("");
const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;
const currentPageTitle = computed(() => {
  // Strip "AI在徐医" prefix so feedback dialog shows actual page name
  const raw = document.title || "当前页面";
  return raw.replace(/^AI在徐医\s*[-—–]\s*/, "").trim() || raw;
});
const auth = useAuthStore();

const routerInstance = useRouter();
routerInstance.beforeEach((to) => {
  console.log("[AIWEB] App 路由导航", { to: to.path, hasUser: !!auth.user });
});

const triggerAgent = (): void => {
  pageAgentOpen.value = true;
};

onMounted(() => {
  window.setTimeout(() => {
    pageAgentIntroActive.value = false;
  }, 1800);
});

onActivated(() => {
  console.log("[AIWEB] App KeepAlive 激活", { route: route.path });
});

onDeactivated(() => {
  console.log("[AIWEB] App KeepAlive 失活", { route: route.path });
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
  // 优先使用当前会话ID
  if (pageAgentConversationId.value) {
    logPageAgentClient("conversation.reuse", {
      conversationId: pageAgentConversationId.value,
      route: currentPageAgentContext.value?.route ?? route.fullPath,
    });
    return pageAgentConversationId.value;
  }
  // 默认创建新对话，不再自动恢复上次会话
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
  try {
    localStorage.setItem("ai-web-last-conversation", conversation.id);
  } catch { /* localStorage 不可用 */ }
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
    // 流式: 先插入占位消息，逐 token 更新
    const msgId = `assistant-${Date.now()}`;
    pageAgentMessages.value = [
      ...pageAgentMessages.value,
      { id: msgId, role: "assistant" as const, text: "" },
    ];
    let streamDone = false;

    const controller = askPageAgentStream(
      {
        ...currentPageAgentContext.value,
        conversationId,
        question: text,
        selectionText: getSelectionText(),
        verbosity: pageAgentVerbosity.value,
      },
      {
        onToken: (t) => {
          if (pageAgentRequestToken.value !== token || streamDone) return;
          const idx = pageAgentMessages.value.findIndex((m) => m.id === msgId);
          if (idx >= 0) {
            pageAgentMessages.value[idx] = {
              ...pageAgentMessages.value[idx],
              text: pageAgentMessages.value[idx].text + t,
            };
          }
        },
        onDone: (sources, meta, answer) => {
          if (pageAgentRequestToken.value !== token) return;
          streamDone = true;
          const idx = pageAgentMessages.value.findIndex((m) => m.id === msgId);
          if (idx >= 0) {
            const current = pageAgentMessages.value[idx];
            pageAgentMessages.value[idx] = {
              ...current,
              sources,
              meta,
              // 若流式未收到任何 token（推理模型 content 为空），
              // 使用后端 done 事件中的兜底回答
              text: current.text || answer || current.text,
            };
          }
          pageAgentLoading.value = false;
          if (!pageAgentTitleSet.value) {
            pageAgentTitleSet.value = true;
            updatePageAgentConversationTitle(conversationId, text.slice(0, 30))
              .catch((err) => console.error("标题更新失败", err));
          }
          // 持久化当前会话ID
          try {
            localStorage.setItem("ai-web-last-conversation", conversationId);
          } catch { /* localStorage 不可用 */ }
        },
        onError: (err) => {
          if (pageAgentRequestToken.value !== token) return;
          streamDone = true;
          const idx = pageAgentMessages.value.findIndex((m) => m.id === msgId);
          if (idx >= 0) {
            // 始终显示错误信息，覆盖可能的部分内容
            pageAgentMessages.value[idx] = {
              ...pageAgentMessages.value[idx],
              text: `⚠️ 请求失败：${err}`,
            };
          }
          pageAgentLoading.value = false;
        },
      }
    );
    pageAgentStreamController.value = controller;
    pageAgentConversationId.value = conversationId;
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
    // loading 由 onDone / onError 回调关闭，不在此处关闭
    // askPageAgentStream 非 await，finally 会在流结束前就执行
  }
};

const copyPageAgentMessage = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

const stopPageAgentRequest = (): void => {
  pageAgentRequestToken.value = Date.now();
  pageAgentStreamController.value?.abort();
  pageAgentStreamController.value = null;
  pageAgentLoading.value = false;
};

const PAGE_AGENT_CONV_PAGE_SIZE = 5;

const loadPageAgentConversations = async (): Promise<void> => {
  if (pageAgentConversationsLoading.value) return;
  pageAgentConversationsLoading.value = true;
  try {
    const result = await listPageAgentConversations({ limit: PAGE_AGENT_CONV_PAGE_SIZE, offset: 0 });
    pageAgentConversations.value = result.items;
    pageAgentConversationsHasMore.value = result.hasMore;
  } catch {
    // silently fail — non-critical
  } finally {
    pageAgentConversationsLoading.value = false;
  }
};

const loadMorePageAgentConversations = async (): Promise<void> => {
  if (pageAgentConversationsLoading.value || !pageAgentConversationsHasMore.value) return;
  pageAgentConversationsLoading.value = true;
  try {
    const result = await listPageAgentConversations({
      limit: PAGE_AGENT_CONV_PAGE_SIZE,
      offset: pageAgentConversations.value.length,
    });
    pageAgentConversations.value = [...pageAgentConversations.value, ...result.items];
    pageAgentConversationsHasMore.value = result.hasMore;
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
    try {
      localStorage.setItem("ai-web-last-conversation", conversationId);
    } catch { /* localStorage 不可用 */ }
  } catch {
    pageAgentMessages.value = [];
  } finally {
    pageAgentLoading.value = false;
  }
};

const resetPageAgentConversation = (): void => {
  pageAgentConversationId.value = "";
  pageAgentMessages.value = [];
  pageAgentConversations.value = [];
  pageAgentConversationsHasMore.value = false;
  pageAgentQuestion.value = "";
  pageAgentRequestToken.value = Date.now();
  pageAgentLoading.value = false;
  pageAgentTitleSet.value = false;
  try {
    localStorage.removeItem("ai-web-last-conversation");
  } catch { /* localStorage 不可用 */ }
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
    pageAgentTitleSet.value = false;
    // 清除 localStorage 中的旧会话，避免路由切换后错误恢复
    try {
      localStorage.removeItem("ai-web-last-conversation");
    } catch { /* localStorage 不可用 */ }
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

interface NavItem {
  path: string;
  name: string;
  icon: any;
  children?: NavItem[];
}

const navItems = computed((): NavItem[] => {
  const items: NavItem[] = [
    { path: "/", name: "资讯发现", icon: FileText },
    { path: "/subscription", name: "智能订阅", icon: Bell },
    { path: "/profile", name: "我的收藏", icon: Star },
  ];

  const adminChildren: NavItem[] = [];

  if (canAccessAdminViews(auth.user)) {
    adminChildren.push(
      { path: "/admin/stats", name: "统计信息", icon: BarChart3 },
      { path: "/ai-lab", name: "AI 试验场", icon: Zap },
      { path: "/admin/publish", name: "内容发布", icon: Settings },
      { path: "/admin/feedback-review", name: "反馈审批", icon: ClipboardCheck }
    );
  }

  if (adminChildren.length > 0) {
    items.push({ path: "", name: "管理功能", icon: LayoutDashboard, children: adminChildren });
  }

  items.push(
    { path: "/ranking", name: "排行榜", icon: Trophy },
    { path: "/feedback-public", name: "反馈墙", icon: MessageSquare }
  );

  return items;
});

const isAdminChildActive = (item: NavItem): boolean => {
  if (!item.children) return false;
  return item.children.some((child) => route.path === child.path);
};

const pageError = ref(false);

const reloadPage = (): void => {
  window.location.reload();
};

onErrorCaptured((err, _instance, info) => {
  console.log("[AIWEB] App onErrorCaptured", { message: (err as Error).message || String(err), info, instanceType: (_instance as any)?.$options?.name || "unknown" });
  console.error("[App] 全局错误捕获:", err, info);
  pageError.value = true;
  return false;
});

watch(pageError, (newVal) => {
  console.log("[AIWEB] App pageError 状态变更", { pageError: newVal });
});

// 诊断：监控 router-view 渲染条件
watch(
  () => ({ path: route.path, pageError: pageError.value }),
  (val) => {
    console.log("[AIWEB] App 渲染条件", val);
  },
  { immediate: true }
);
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
              AI在徐医
            </span>
          </div>

          <!-- Navigation -->
          <nav class="hidden md:flex items-center gap-1 bg-white/70 p-1 rounded-2xl border border-[#0288d1]/20 backdrop-blur-xl">
            <template v-for="item in navItems" :key="item.path || item.name">
              <!-- Regular nav item -->
              <router-link
                v-if="!item.children"
                :to="item.path"
                class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
                :class="route.path === item.path ? 'bg-[#b3e5fc]/70 text-[#01579b] shadow-sm border border-[#0288d1]/25' : 'text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] border border-transparent'"
              >
                <component :is="item.icon" class="w-4 h-4" />
                {{ item.name }}
              </router-link>
              <!-- Dropdown: 管理功能 -->
              <div
                v-else
                class="relative"
                @mouseenter="adminDropdownOpen = true"
                @mouseleave="adminDropdownOpen = false"
              >
                <button
                  class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 border border-transparent"
                  :class="isAdminChildActive(item) ? 'bg-[#b3e5fc]/70 text-[#01579b] shadow-sm border-[#0288d1]/25' : 'text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe]'"
                >
                  <component :is="item.icon" class="w-4 h-4" />
                  {{ item.name }}
                  <ChevronDown class="w-3 h-3 transition-transform" :class="{ 'rotate-180': adminDropdownOpen }" />
                </button>
                <div
                  v-show="adminDropdownOpen"
                  class="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-[#0288d1]/15 py-1 min-w-[140px] z-50"
                >
                  <router-link
                    v-for="child in item.children"
                    :key="child.path"
                    :to="child.path"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[#e1f5fe]"
                    :class="route.path === child.path ? 'text-[#01579b] font-medium' : 'text-[#4f6b8a]'"
                  >
                    <component :is="child.icon" class="w-4 h-4" />
                    {{ child.name }}
                  </router-link>
                </div>
              </div>
            </template>
          </nav>

          <!-- Actions -->
          <div class="flex items-center gap-3">
            <router-link
              to="/profile"
              class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-[#e1f5fe] text-[#4f6b8a] hover:text-[#01579b]"
              title="个人中心"
            >
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-[#0288d1] to-[#01579b] flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                {{ auth.user?.displayName?.charAt(0) || "U" }}
              </div>
              <span class="hidden sm:inline max-w-[6rem] truncate">{{ auth.user?.displayName || "个人中心" }}</span>
            </router-link>
            <button @click="toggleDark" class="p-2 text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] rounded-xl transition-colors" :title="isDark ? '浅色模式' : '深色模式'">
              <component :is="isDark ? Moon : Sun" class="w-5 h-5" />
            </button>
            <!-- Font scale control -->
            <div class="flex items-center gap-0.5" title="字体大小">
              <button
                v-for="s in SCALES"
                :key="s.value"
                type="button"
                class="px-1.5 py-0.5 rounded text-xs font-medium transition-colors"
                :class="fontScale === s.value ? 'bg-[#0288d1] text-white' : 'text-[#8aa3bc] hover:text-[#01579b] hover:bg-[#e1f5fe]'"
                @click="setScale(s.value)"
              >
                {{ s.label }}
              </button>
            </div>
            <button @click="logout" class="p-2 text-[#4f6b8a] hover:text-[#01579b] hover:bg-[#e1f5fe] rounded-xl transition-colors" title="退出登录">
              <LogOut class="w-5 h-5" />
            </button>
          </div>

        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative">
      <div v-if="pageError" class="glass-panel rounded-2xl border p-8 text-center">
        <h2 class="text-lg font-semibold text-[#0f4069]">页面加载异常</h2>
        <p class="mt-2 text-[#4f6b8a]">遇到意外错误，请刷新页面重试。</p>
        <button
          type="button"
          class="btn-primary mt-4"
          @click="pageError = false; reloadPage()"
        >
          刷新页面
        </button>
      </div>
      <router-view v-slot="{ Component }" v-else>
        <KeepAlive include="ArticlesPage">
          <component :is="Component" />
        </KeepAlive>
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
      :conversations-has-more="pageAgentConversationsHasMore"
      :verbosity="pageAgentVerbosity"
      :page-type="currentPageAgentContext?.pageType"
      @close="pageAgentOpen = false; pageAgentConversations = []; pageAgentConversationsHasMore = false; pageAgentMessages = []; pageAgentConversationId = ''; pageAgentTitleSet = false"
      @submit="submitPageAgentQuestion"
      @stop="stopPageAgentRequest"
      @copy="copyPageAgentMessage"
      @update:question="pageAgentQuestion = $event"
      @update:verbosity="pageAgentVerbosity = $event"
      @load-conversations="loadPageAgentConversations"
      @load-more-conversations="loadMorePageAgentConversations"
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

    <BackToTop />

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
