# 订阅系统排他频率 + 推送去重 + 小bug修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将订阅频率改为互斥（每用户只能选一种），修复跨频率重复推送，添加文章级推送去重，修复管理功能菜单权限和反馈墙默认排序。

**Architecture:** 数据库 UNIQUE 约束从 `(user_id, frequency)` 改为 `(user_id)`，订阅 API 和前端 UI 适配单频率模型。推送服务添加 article-level 去重检查。孤儿 pending 记录通过定时 SQL 清理。

**Tech Stack:** PostgreSQL (native SQL), Node.js/Express/TypeScript, Vue 3/TypeScript

---

### Task 1: DB Migration — 清理多频率订阅 + 改约束

**Files:**
- Modify: `apps/api/src/lib/db.ts`

- [ ] **Step 1: 在 schemaSql 末尾追加 migration SQL**

在 `db.ts` 的 `schemaSql` 字符串末尾追加以下 migration：

```sql
-- Migration 2026-06-02: 订阅频率互斥 — 每个用户只保留一条订阅，改 UNIQUE 约束
DO $$
BEGIN
  -- 删除重复订阅，每用户只保留 updated_at 最新的一条
  DELETE FROM subscriptions
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM subscriptions
    ORDER BY user_id, updated_at DESC
  );

  -- 删除旧约束
  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_frequency_key;

  -- 添加新约束（仅当不存在时）
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_key'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
```

- [ ] **Step 2: 验证 migration 语法**

运行 TypeScript 编译确认无语法错误：
```bash
cd /opt/idapps/ai_web && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```

---

### Task 2: Store 层 — upsertByUser 改 conflict target

**Files:**
- Modify: `apps/api/src/lib/store.ts:810-855`

- [ ] **Step 1: 修改 ON CONFLICT 子句**

找到 `subscriptionStore.upsertByUser` 方法（约 L814），将：
```sql
ON CONFLICT (user_id, frequency)
```
改为：
```sql
ON CONFLICT (user_id)
```

完整改动（只改一行）：
```typescript
// L826: 原来
// ON CONFLICT (user_id, frequency)
// 改为
ON CONFLICT (user_id)
```

---

### Task 3: 订阅路由适配单频率

**Files:**
- Modify: `apps/api/src/modules/subscriptions/routes.ts`

- [ ] **Step 1: PUT /me — 当用户切换频率时，先删旧再插入**

当前 `upsertByUser` 按 `user_id` 冲突更新，这意味着如果用户之前是 daily，现在改成 weekly，会原地更新。逻辑正确无需大改，只需确保日志清晰。

代码不变。逻辑验证：`ON CONFLICT (user_id) DO UPDATE` 确保每次 PUT 都覆盖用户唯一的订阅记录。

**无需改动。**

---

### Task 4: 前端 — SubscriptionPage 改为单频率

**Files:**
- Modify: `apps/web/src/views/SubscriptionPage.vue`

- [ ] **Step 1: 重写 script setup — 从多频率草稿改为单频率**

删除 `subscriptionDrafts` Record，改为单一 `draft`。频率切换时从后端已有的唯一订阅读取或使用默认值。

完整替换 `<script setup>` 部分：

```typescript
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { BellRing, IdCard, UserRound, Tags, Zap, CheckCircle2 } from "lucide-vue-next";

import { buildSubscriptionContext, setPageAgentContext } from "../page_agent/context";
import {
  getCurrentUser,
  getMySubscriptions,
  listChannels,
  saveMySubscription,
  type Channel,
  type Subscription,
  type User,
} from "../services/api";

type SubscriptionFrequency = "daily" | "weekly" | "instant";

const frequencyOptions: Array<{
  value: SubscriptionFrequency;
  label: string;
  description: string;
}> = [
  { value: "instant", label: "即时", description: "发文即推" },
  { value: "daily", label: "每日", description: "AI 汇总" },
  { value: "weekly", label: "每周", description: "精华提炼" },
];

const currentUser = ref<User | null>(null);
const frequency = ref<SubscriptionFrequency>("daily");
const channelCodes = ref<string[]>([]);
const enabled = ref(true);
const message = ref("");
const loading = ref(false);
const channels = ref<Channel[]>([]);

const buildDefaultChannelCodes = (): string[] =>
  channels.value.slice(0, 2).map((item) => item.code);

const load = async (): Promise<void> => {
  const [channelItems, subscriptions, user] = await Promise.all([
    listChannels(),
    getMySubscriptions(),
    getCurrentUser(),
  ]);
  channels.value = channelItems;
  currentUser.value = user;
  // 现在每个用户只有一条订阅记录
  if (subscriptions.length > 0) {
    const sub = subscriptions[0];
    frequency.value = sub.frequency;
    channelCodes.value = sub.channelCodes.length > 0 ? sub.channelCodes : buildDefaultChannelCodes();
    enabled.value = sub.enabled;
  } else {
    channelCodes.value = buildDefaultChannelCodes();
  }
};

const toggleChannel = (code: string): void => {
  if (channelCodes.value.includes(code)) {
    channelCodes.value = channelCodes.value.filter((item) => item !== code);
  } else {
    channelCodes.value = [...channelCodes.value, code];
  }
};

const save = async (): Promise<void> => {
  if (channelCodes.value.length === 0) {
    message.value = "请至少选择一个栏目";
    setTimeout(() => (message.value = ""), 3000);
    return;
  }
  loading.value = true;
  message.value = "";
  console.info("[SubscriptionPage] 保存订阅配置", {
    frequency: frequency.value,
    enabled: enabled.value,
    channelCount: channelCodes.value.length,
  });
  try {
    const saved = await saveMySubscription({
      frequency: frequency.value,
      channelCodes: channelCodes.value,
      enabled: enabled.value,
    });
    frequency.value = saved.frequency;
    channelCodes.value = saved.channelCodes;
    enabled.value = saved.enabled;
    message.value = "智能订阅配置已更新并生效";
    setTimeout(() => (message.value = ""), 3000);
  } finally {
    loading.value = false;
  }
};

onMounted(load);

watchEffect(() => {
  setPageAgentContext(
    buildSubscriptionContext({
      route: "/subscription",
      pageTitle: "智能订阅",
      enabled: enabled.value,
      frequency: frequency.value,
      channelCodes: channelCodes.value,
    })
  );
});

onBeforeUnmount(() => {
  setPageAgentContext(null);
});
</script>
```

- [ ] **Step 2: 更新 template — 移除多频率草稿逻辑，简化显示**

完整替换 `<template>` 部分（保留原有样式结构，去掉多频率独立栏目配置的描述）：

```html
<template>
  <div class="max-w-3xl mx-auto">
    <div class="text-center mb-10">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#e1f5fe] text-[#0288d1] mb-4 ring-1 ring-[#81d4fa]">
        <BellRing class="w-8 h-8" />
      </div>
      <h1 class="text-3xl font-bold text-[#0f4069]">智能订阅中心</h1>
      <p class="text-[#4f6b8a] mt-2">按角色和关注方向配置 AI 资讯推送节奏</p>
    </div>

    <section class="glass-panel rounded-3xl p-8 md:p-10 relative overflow-hidden border">
      <!-- bg glow -->
      <div class="absolute -top-24 -right-24 w-64 h-64 bg-[#81d4fa]/35 blur-[80px] pointer-events-none"></div>

      <div class="space-y-8 relative z-10">
        <!-- 当前用户 -->
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm font-medium text-[#0f4069]">
            <UserRound class="w-4 h-4 text-[#0288d1]" />
            当前登录用户
          </label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="rounded-xl border border-[#81d4fa]/70 bg-white px-4 py-3">
              <div class="flex items-center gap-2 text-xs text-[#4f6b8a]">
                <IdCard class="w-3.5 h-3.5 text-[#0288d1]" />
                工号
              </div>
              <div class="mt-1 text-sm font-semibold text-[#0f4069]">
                {{ currentUser?.id || "-" }}
              </div>
            </div>
            <div class="rounded-xl border border-[#81d4fa]/70 bg-white px-4 py-3">
              <div class="flex items-center gap-2 text-xs text-[#4f6b8a]">
                <UserRound class="w-3.5 h-3.5 text-[#0288d1]" />
                姓名
              </div>
              <div class="mt-1 text-sm font-semibold text-[#0f4069]">
                {{ currentUser?.displayName || "-" }}
              </div>
            </div>
          </div>
          <p class="text-xs text-[#4f6b8a]">保存时将自动使用当前登录用户的工号与姓名写入订阅配置</p>
        </div>

        <!-- 栏目 -->
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm font-medium text-[#0f4069]">
            <Tags class="w-4 h-4 text-[#0288d1]" />
            关注领域
          </label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              v-for="item in channels"
              :key="item.code"
              type="button"
              class="text-left rounded-xl border px-3 py-2 text-sm transition-all"
              :class="channelCodes.includes(item.code) ? 'border-[#0288d1] bg-[#e1f5fe] text-[#01579b]' : 'border-[#81d4fa]/70 bg-white text-[#4f6b8a] hover:border-[#4fc3f7]'"
              @click="toggleChannel(item.code)"
            >
              {{ item.name }}
            </button>
          </div>
          <p class="text-xs text-[#4f6b8a]">订阅栏目与后端栏目字典自动联动</p>
        </div>

        <!-- 频率 — 排他选择 -->
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm font-medium text-[#0f4069]">
            <Zap class="w-4 h-4 text-[#0288d1]" />
            推送频率（三选一）
          </label>
          <div class="grid grid-cols-3 gap-4">
            <label
              v-for="option in frequencyOptions"
              :key="option.value"
              class="relative cursor-pointer"
            >
              <input type="radio" v-model="frequency" :value="option.value" class="peer sr-only" />
              <div class="p-4 rounded-xl border border-[#81d4fa]/70 bg-white text-center text-[#4f6b8a] peer-checked:border-[#0288d1] peer-checked:bg-[#e1f5fe] peer-checked:text-[#01579b] transition-all">
                <div class="font-medium">{{ option.label }}</div>
                <div class="text-xs opacity-70 mt-1">{{ option.description }}</div>
                <div class="text-[11px] mt-2 opacity-75">
                  {{ channelCodes.length }} 个栏目
                </div>
              </div>
            </label>
          </div>
          <p class="text-xs text-[#4f6b8a]">即时、每日、每周通知互斥，每位用户只能启用一种推送模式</p>
        </div>

        <hr class="border-[#b3e5fc]" />

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-3 cursor-pointer group">
            <div class="relative flex items-center justify-center">
              <input
                :checked="enabled"
                type="checkbox"
                class="peer sr-only"
                @change="enabled = ($event.target as HTMLInputElement).checked"
              />
              <div class="w-12 h-6 bg-[#cfd8dc] rounded-full peer-checked:bg-[#0288d1] transition-colors"></div>
              <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6 shadow-sm"></div>
            </div>
            <div class="flex flex-col">
              <span class="text-[#0f4069] font-medium group-hover:text-[#01579b] transition-colors">启用智能推送引擎</span>
              <span
                class="text-xs transition-colors"
                :class="enabled ? 'text-[#0277bd]' : 'text-[#607d8b]'"
              >
                {{ enabled ? "当前已开启" : "当前已关闭" }}
              </span>
            </div>
          </label>

          <div class="flex items-center gap-4">
            <span v-if="message" class="flex items-center gap-1 text-sm text-[#0277bd] animate-pulse">
              <CheckCircle2 class="w-4 h-4" />
              {{ message }}
            </span>
            <button @click="save" :disabled="loading" class="btn-primary flex items-center gap-2 min-w-[120px] justify-center">
              <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span v-else>保存配置</span>
            </button>
          </div>
        </div>

      </div>
    </section>
  </div>
</template>
```

---

### Task 5: 推送服务 — 文章级去重

**Files:**
- Modify: `apps/api/src/modules/push/service.ts:815-846`

- [ ] **Step 1: 在 handleArticlePublished 入口添加去重检查**

在 `handleArticlePublished` 方法中，`isWithinInstantPushWindow` 检查之后，查询订阅之前，添加：

```typescript
async handleArticlePublished(article: Article): Promise<number> {
  if (!article.publishedAt) {
    logger.warn("push.instant.skip.missing_published_at", {
      articleId: article.id,
      channelCode: article.channelCode,
    });
    return 0;
  }
  const publishedAt = new Date(article.publishedAt);
  if (!isWithinInstantPushWindow(publishedAt)) {
    logger.info("push.instant.deferred", {
      articleId: article.id,
      channelCode: article.channelCode,
      publishedAt: article.publishedAt,
    });
    return 0;
  }
  // 去重：检查是否已有该文章的成功推送记录
  const existingRecords = await pushRecordStore.listByArticleId(article.id);
  const alreadyPushed = existingRecords.some((r) => r.status === "success");
  if (alreadyPushed) {
    logger.info("push.instant.skip.already_pushed", {
      articleId: article.id,
      channelCode: article.channelCode,
    });
    return 0;
  }
  // ... 原有逻辑
```

- [ ] **Step 2: 在 store.ts 添加 listByArticleId 方法**

在 `pushRecordStore` 中添加：

```typescript
async listByArticleId(articleId: string): Promise<PushRecord[]> {
  const result = await query<PushRecordRow>(
    `
    SELECT * FROM push_records
    WHERE article_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [articleId]
  );
  return result.rows.map(mapPushRecord);
},
```

---

### Task 6: 孤儿 pending 记录清理

**Files:**
- Modify: `apps/api/src/lib/db.ts`

- [ ] **Step 1: 在 schemaSql 追加清理语句**

```sql
-- 清理超过 1 小时仍为 pending 的推送记录
DELETE FROM push_records
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour';
```

---

### Task 7: 小bug — 管理功能菜单权限

**Files:**
- Modify: `apps/web/src/App.vue:328-330`

- [ ] **Step 1: 将"统计信息"的访问条件从 `auth.user` 改为 `canAccessAdminViews(auth.user)`**

在 `navItems` computed 中（约 L328），将：
```typescript
if (auth.user) {
  adminChildren.push({ path: "/admin/stats", name: "统计信息", icon: BarChart3 });
}
```
改为：
```typescript
if (canAccessAdminViews(auth.user)) {
  adminChildren.push({ path: "/admin/stats", name: "统计信息", icon: BarChart3 });
}
```

这意味着现在所有 adminChildren 项都受 `canAccessAdminViews` 保护。原来的两个 if 块可以合并：

```typescript
if (canAccessAdminViews(auth.user)) {
  adminChildren.push(
    { path: "/admin/stats", name: "统计信息", icon: BarChart3 },
    { path: "/ai-lab", name: "AI 试验场", icon: Zap },
    { path: "/admin/publish", name: "内容发布", icon: Settings },
    { path: "/admin/feedback-review", name: "反馈审批", icon: ClipboardCheck }
  );
}
```

---

### Task 8: 小bug — 反馈墙默认排序

**Files:**
- Modify: `apps/web/src/views/FeedbackPublicPage.vue:14`

- [ ] **Step 1: 改默认排序**

```typescript
// L14: 从 "recent" 改为 "popular"
const sortMode = ref<"recent" | "popular">("popular");
```

---

### Task 9: 验证 — 编译 + 构建

- [ ] **Step 1: 后端 TypeScript 编译**
```bash
cd /opt/idapps/ai_web && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -5
```
Expected: 无 error

- [ ] **Step 2: 后端构建**
```bash
cd /opt/idapps/ai_web && npm run build:api 2>&1 | tail -10
```
Expected: 无 error

- [ ] **Step 3: 前端构建**
```bash
cd /opt/idapps/ai_web && npm run build:web 2>&1 | tail -10
```
Expected: 无 error

- [ ] **Step 4: 提交**
```bash
cd /opt/idapps/ai_web
git add -A
git commit -m "fix: 订阅频率互斥 + 推送去重 + 管理菜单权限 + 反馈墙默认最热"
git push origin HEAD
```
