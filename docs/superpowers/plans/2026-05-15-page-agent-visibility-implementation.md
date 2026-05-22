# Page Agent Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `page agent` discoverability with lightweight motion while keeping its current position, transparency, and interaction model unchanged.

**Architecture:** The change stays entirely in the web app. `PageAgentLauncher.vue` owns the visual animation states, while `App.vue` passes a one-time intro hint signal without altering the existing drawer or API flow.

**Tech Stack:** Vue 3, TypeScript, existing Tailwind utility classes, existing `PageAgentLauncher.vue`

---

## File Map

- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/components/PageAgentLauncher.vue`

### Task 1: Add Lightweight Motion States Without Moving The Entry

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/components/PageAgentLauncher.vue`

- [ ] **Step 1: Add the one-time intro state in `App.vue`**

Modify `apps/web/src/App.vue`:

```ts
const isAgentHovered = ref(false);
const pageAgentIntroActive = ref(true);

onMounted(() => {
  window.setTimeout(() => {
    pageAgentIntroActive.value = false;
  }, 1800);
});
```

Pass the new prop to the launcher:

```vue
<PageAgentLauncher
  :is-hovered="isAgentHovered"
  :intro-active="pageAgentIntroActive"
  @click="triggerAgent"
  @mouseenter="isAgentHovered = true"
  @mouseleave="isAgentHovered = false"
/>
```

- [ ] **Step 2: Build first and confirm the prop change fails before the component update**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
Property 'introActive' does not exist on type ...
```

or an equivalent Vue type error showing the launcher prop contract is not updated yet.

- [ ] **Step 3: Update `PageAgentLauncher.vue` with subtle intro and idle animation**

Modify `apps/web/src/components/PageAgentLauncher.vue`:

```vue
<script setup lang="ts">
defineProps<{
  isHovered: boolean;
  introActive: boolean;
}>();

defineEmits<{
  click: [];
  mouseenter: [];
  mouseleave: [];
}>();
</script>
```

Replace the wrapper/button classes with motion that preserves the current placement and transparency:

```vue
<template>
  <div
    class="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
    :class="[
      isHovered ? 'scale-105 opacity-100 translate-y-0' : 'scale-100 opacity-95 translate-y-1',
      introActive ? 'animate-[page-agent-intro_1.6s_ease-out_1]' : '',
    ]"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')"
  >
    <div class="relative group">
      <div
        class="absolute -inset-1 rounded-full bg-gradient-to-r from-[#b3e5fc] to-[#81d4fa] blur transition-all duration-700"
        :class="isHovered ? 'opacity-70 scale-105' : 'opacity-35 scale-100 animate-[page-agent-breathe_3.2s_ease-in-out_infinite]'"
      ></div>

      <button
        type="button"
        class="relative flex items-center gap-3 rounded-full border border-[#0288d1]/25 bg-white/95 px-6 py-3 text-[#0f4f80] shadow-[0_20px_35px_-20px_rgba(2,136,209,0.45)] transition-all duration-300 hover:-translate-y-0.5"
        @click="$emit('click')"
      >
        <span class="text-sm font-medium tracking-wide">AI 智能分析与搜索</span>
      </button>
    </div>
  </div>
</template>
```

Append scoped keyframes in the same file:

```vue
<style scoped>
@keyframes page-agent-breathe {
  0%, 100% { transform: scale(1); opacity: 0.32; }
  50% { transform: scale(1.04); opacity: 0.42; }
}

@keyframes page-agent-intro {
  0% { transform: translateY(10px) scale(0.98); opacity: 0.88; }
  60% { transform: translateY(-2px) scale(1.02); opacity: 0.97; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
</style>
```

- [ ] **Step 4: Build and manually verify the motion constraints**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
vue-tsc -b && vite build
```

and the build completes without errors.

Then manually verify:

```text
1. 按钮仍在底部居中原位置。
2. 默认透明度观感与当前接近，没有变成实心重按钮。
3. 首次进入页面只有一次轻量入场动效。
4. 空闲态只有很轻的呼吸式光晕，不跳动。
5. 悬停时位移和光晕更顺滑，但不会误导为自动展开。
```

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/web/src/App.vue apps/web/src/components/PageAgentLauncher.vue
git -C /opt/idapps/ai_web commit -m "feat: refine page agent visibility" || true
```

Expected:

```text
If Git is available, a commit named "feat: refine page agent visibility" is created. If the workspace is not a Git repository, the shell reports that state and continues.
```

### Task 2: Regression-Check Existing Drawer Behavior

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/components/PageAgentLauncher.vue`

- [ ] **Step 1: Review the unchanged launcher contract before regression verification**

Keep these existing calls in `apps/web/src/App.vue` unchanged:

```ts
const triggerAgent = (): void => {
  pageAgentOpen.value = true;
};

const stopPageAgentRequest = (): void => {
  pageAgentRequestToken.value = Date.now();
  pageAgentLoading.value = false;
};
```

Keep the existing launcher events unchanged in `apps/web/src/components/PageAgentLauncher.vue`:

```ts
defineEmits<{
  click: [];
  mouseenter: [];
  mouseleave: [];
}>();
```

- [ ] **Step 2: Run the web build again as a regression gate**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
vite v...
✓ built in ...
```

- [ ] **Step 3: Manually exercise the existing page-agent flow**

Use the running app and verify:

```text
1. 点击入口后仍能打开现有 PageAgentPanel。
2. 提问、停止、复制、关闭都保持原样。
3. 路由切换后，会话仍会按现有逻辑清空。
4. 右侧反馈入口如果已实现，不会与 page agent 重叠或争抢焦点。
```

- [ ] **Step 4: If any regression appears, apply the smallest fix only**

Only touch the launcher wrapper classes or intro timer if needed. Keep this minimal fallback change ready:

```ts
onMounted(() => {
  const timer = window.setTimeout(() => {
    pageAgentIntroActive.value = false;
  }, 1800);
  onBeforeUnmount(() => window.clearTimeout(timer));
});
```

- [ ] **Step 5: Commit**

Run:

```bash
git -C /opt/idapps/ai_web status || true
git -C /opt/idapps/ai_web add apps/web/src/App.vue apps/web/src/components/PageAgentLauncher.vue
git -C /opt/idapps/ai_web commit -m "test: verify page agent motion regressions" || true
```

Expected:

```text
If Git is available, a commit named "test: verify page agent motion regressions" is created. If the workspace is not a Git repository, the shell reports that state and continues.
```

## Self-Review

- **Spec coverage:** The plan keeps current position and transparency, adds lightweight intro/idle/hover motion, and explicitly preserves the existing drawer and QA behavior.
- **Placeholder scan:** Every step names exact files and commands; no `TODO`/`TBD` markers remain.
- **Type consistency:** The only new prop is `introActive`, and it is added consistently in both `App.vue` and `PageAgentLauncher.vue`.
