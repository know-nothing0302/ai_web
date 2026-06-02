import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { reportPageView } from "./services/api";

const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;

const defaultTitle = "AI徐医";

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
  { path: "/profile", component: () => import("./views/ProfilePage.vue"), meta: { title: `${defaultTitle} - 个人中心` } },
  { path: "/ranking", component: () => import("./views/RankingPage.vue"), meta: { title: `${defaultTitle} - 排行榜` } },
  { path: "/feedback-public", component: () => import("./views/FeedbackPublicPage.vue"), meta: { title: `${defaultTitle} - 反馈墙`, public: true } },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

let lastTrackedRoute = "";

router.beforeEach(async (to) => {
  document.title = typeof to.meta.title === "string" ? to.meta.title : defaultTitle;

  if (to.meta.public) {
    return true;
  }

  const auth = useAuthStore();
  await auth.ensureInitialized();

  if (!auth.user) {
    const redirect = encodeURIComponent(to.fullPath || "/");
    window.location.href = `${apiBase}/auth/cas/login?redirect=${redirect}`;
    return false;
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
