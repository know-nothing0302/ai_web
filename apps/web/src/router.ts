import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { reportPageView } from "./services/api";

const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;

const defaultTitle = "AI在徐医";

const routes = [
  { path: "/", component: () => import("./views/ArticlesPage.vue"), meta: { title: defaultTitle } },
  { path: "/articles/:id", component: () => import("./views/ArticleDetailPage.vue"), meta: { title: `${defaultTitle} - 文章详情` } },
  { path: "/push-digests/today", component: () => import("./views/TodayPushDigestPage.vue"), meta: { title: `${defaultTitle} - 今日推送` } },
  { path: "/subscription", component: () => import("./views/SubscriptionPage.vue"), meta: { title: `${defaultTitle} - 智能订阅` } },
  { path: "/admin", component: () => import("./views/AdminPage.vue"), meta: { title: `${defaultTitle} - 内容发布` } },
  { path: "/admin/publish", component: () => import("./views/AdminPublishPage.vue"), meta: { title: `${defaultTitle} - 内容发布` } },
  { path: "/admin/stats", component: () => import("./views/AdminStatsPage.vue"), meta: { title: `${defaultTitle} - 统计信息` } },
  { path: "/admin/birthday", component: () => import("./views/AdminBirthdayPage.vue"), meta: { title: `${defaultTitle} - 生日推送` } },
  { path: "/admin/feedback-review", component: () => import("./views/FeedbackReviewPage.vue"), meta: { title: `${defaultTitle} - 反馈审批` } },
  { path: "/ai-lab", component: () => import("./views/AiLabPage.vue"), meta: { title: `${defaultTitle} - AI 试验场` } },
  { path: "/ai-lab/survey", component: () => import("./views/SurveyListPage.vue"), meta: { public: true, title: `${defaultTitle} - 智能问卷` } },
  { path: "/ai-lab/survey/create", component: () => import("./views/SurveyCreatePage.vue"), meta: { title: `${defaultTitle} - 创建问卷` } },
  { path: "/ai-lab/survey/:id", component: () => import("./views/SurveyDetailPage.vue"), meta: { title: `${defaultTitle} - 问卷详情` } },
  { path: "/ai-lab/survey/:id/stats", component: () => import("./views/SurveyStatsPage.vue"), meta: { title: `${defaultTitle} - 问卷统计` } },
  { path: "/s/:token", component: () => import("./views/SurveyRespondPage.vue"), meta: { title: `${defaultTitle} - 填写问卷`, public: true } },
  { path: "/profile", component: () => import("./views/ProfilePage.vue"), meta: { title: `${defaultTitle} - 个人中心` } },
  { path: "/ranking", component: () => import("./views/RankingPage.vue"), meta: { title: `${defaultTitle} - 排行榜` } },
  { path: "/feedback-public", component: () => import("./views/FeedbackPublicPage.vue"), meta: { title: `${defaultTitle} - 反馈墙`, public: true } },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

let lastTrackedRoute = "";

const CAS_RETURN_KEY = "cas_return_to";

router.beforeEach(async (to) => {
  document.title = typeof to.meta.title === "string" ? to.meta.title : defaultTitle;

  if (to.meta.public) {
    return true;
  }

  const auth = useAuthStore();
  await auth.ensureInitialized();

  if (!auth.user) {
    // 存储目标路径到 sessionStorage，CAS 回调后由 App.vue 读取并跳转。
    // sessionStorage 按 origin 隔离，CAS 跨站 redirect 后仍然可用，
    // 彻底绕过 express-session 在 redirect 链中丢失数据的问题。
    const target = to.fullPath || "/";
    try {
      sessionStorage.setItem(CAS_RETURN_KEY, target);
    } catch { /* sessionStorage 不可用 */ }
    window.location.href = `${apiBase}/auth/cas/login?redirect=${encodeURIComponent(target)}`;
    return false;
  }

  // 登录后：如果在当前页首次完成认证，跳转到 CAS 前存储的目标路径
  const returnTo = (() => {
    try { return sessionStorage.getItem(CAS_RETURN_KEY); } catch { return null; }
  })();
  if (returnTo) {
    try { sessionStorage.removeItem(CAS_RETURN_KEY); } catch { /* noop */ }
    if (returnTo !== "/" && returnTo !== to.fullPath) {
      return { path: returnTo, replace: true };
    }
  }

  return true;
});

router.afterEach((to) => {
  const routeKey = to.fullPath;
  if (routeKey === lastTrackedRoute) {
    return;
  }
  lastTrackedRoute = routeKey;
  void reportPageView({
    pageRoute: to.fullPath,
    pageTitle: typeof to.meta.title === "string" ? to.meta.title : defaultTitle,
  }).catch(() => undefined);
});
