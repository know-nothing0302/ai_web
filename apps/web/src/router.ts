import { createRouter, createWebHistory } from "vue-router";
import { getCurrentUser, reportPageView } from "./services/api";
import ArticleDetailPage from "./views/ArticleDetailPage.vue";
import ArticlesPage from "./views/ArticlesPage.vue";
import AdminPage from "./views/AdminPage.vue";
import AdminPublishPage from "./views/AdminPublishPage.vue";
import AdminStatsPage from "./views/AdminStatsPage.vue";
import AdminBirthdayPage from "./views/AdminBirthdayPage.vue";
import SubscriptionPage from "./views/SubscriptionPage.vue";
import TodayPushDigestPage from "./views/TodayPushDigestPage.vue";
import ProfilePage from "./views/ProfilePage.vue";
import AiLabPage from "./views/AiLabPage.vue";
import FeedbackReviewPage from "./views/FeedbackReviewPage.vue";
import FeedbackPublicPage from "./views/FeedbackPublicPage.vue";

const appBase = import.meta.env.BASE_URL;
const apiBase = appBase.endsWith("/") ? `${appBase}api` : `${appBase}/api`;

const defaultTitle = "AI徐医";

const routes = [
  { path: "/", component: ArticlesPage, meta: { title: defaultTitle } },
  { path: "/articles/:id", component: ArticleDetailPage, meta: { title: `${defaultTitle} - 文章详情` } },
  { path: "/push-digests/today", component: TodayPushDigestPage, meta: { title: `${defaultTitle} - 今日推送` } },
  { path: "/subscription", component: SubscriptionPage, meta: { title: `${defaultTitle} - 智能订阅` } },
  { path: "/admin", component: AdminPage, meta: { title: `${defaultTitle} - 内容发布` } },
  { path: "/admin/publish", component: AdminPublishPage, meta: { title: `${defaultTitle} - 内容发布` } },
  { path: "/admin/stats", component: AdminStatsPage, meta: { title: `${defaultTitle} - 统计信息` } },
  { path: "/admin/birthday", component: AdminBirthdayPage, meta: { title: `${defaultTitle} - 生日推送` } },
  { path: "/admin/feedback-review", component: FeedbackReviewPage, meta: { title: `${defaultTitle} - 反馈审批` } },
  { path: "/ai-lab", component: AiLabPage, meta: { title: `${defaultTitle} - AI 试验场` } },
  { path: "/profile", component: ProfilePage, meta: { title: `${defaultTitle} - 个人中心` } },
  { path: "/feedback-public", component: FeedbackPublicPage, meta: { title: `${defaultTitle} - 反馈墙` } },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

let lastTrackedRoute = "";

router.beforeEach(async (to) => {
  document.title = typeof to.meta.title === "string" ? to.meta.title : defaultTitle;
  try {
    const user = await getCurrentUser();
    if (!user) {
      const redirect = encodeURIComponent(to.fullPath || "/");
      window.location.href = `${apiBase}/auth/cas/login?redirect=${redirect}`;
      return false;
    }
    return true;
  } catch {
    const redirect = encodeURIComponent(to.fullPath || "/");
    window.location.href = `${apiBase}/auth/cas/login?redirect=${redirect}`;
    return false;
  }
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
