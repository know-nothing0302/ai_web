# Page Agent UI Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 page agent 问答面板改为底部居中抽屉式交互，支持历史消息、固定底部输入区、Markdown 渲染、复制按钮和更符合习惯的发送交互。

**Architecture:** 保持现有后端问答接口不变，只重构前端面板状态与展示结构。`App.vue` 负责当前页面会话状态、发送与路由切换清空；`PageAgentPanel.vue` 负责抽屉布局、历史消息渲染、输入快捷键、复制和滚动；`context.ts` 继续维护页面上下文，不承担历史会话职责。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Lucide Vue、Marked、DOMPurify、现有 Tailwind 风格类

---

## 文件结构

### 主要修改

- `apps/web/src/App.vue`
  - 管理页面问答历史、当前输入、发送状态、路由切换清空
- `apps/web/src/components/PageAgentPanel.vue`
  - 重构为底部居中抽屉，支持历史消息、固定输入区、Markdown 渲染和复制
- `apps/web/src/page_agent/types.ts`
  - 补充前端消息项类型
- `apps/web/src/page_agent/context.ts`
  - 保持页面上下文能力，必要时补充轻量工具

### 可能修改

- `apps/web/src/style.css`
  - 若抽屉与 Markdown 样式需要复用样式类，可补少量样式

## 任务拆分

### Task 1: 定义前端会话消息类型并写出失败前验证

**Files:**
- Modify: `apps/web/src/page_agent/types.ts`
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 在类型文件补充历史消息结构**

```ts
export interface PageAgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: PageAgentSource[];
  meta?: PageAgentResponse["meta"];
}
```

- [ ] **Step 2: 在 `App.vue` 中先接入最小会话状态，故意让模板引用失败**

```ts
const pageAgentMessages = ref<PageAgentMessage[]>([]);
```

```vue
<PageAgentPanel
  :messages="pageAgentMessages"
  ...
/>
```

- [ ] **Step 3: 运行前端构建验证 RED**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: FAIL，报 `PageAgentPanel` 缺少 `messages` prop 或相关类型错误

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/page_agent/types.ts apps/web/src/App.vue
git commit -m "test: add page agent message state expectation"
```

### Task 2: 重构面板为底部居中抽屉并支持历史消息

**Files:**
- Modify: `apps/web/src/components/PageAgentPanel.vue`

- [ ] **Step 1: 为面板增加完整 props 和事件定义**

```ts
const props = defineProps<{
  visible: boolean;
  loading: boolean;
  question: string;
  messages: PageAgentMessage[];
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
  stop: [];
  copy: [value: string];
  "update:question": [value: string];
}>();
```

- [ ] **Step 2: 改为底部居中抽屉，不再使用整屏蒙版**

```vue
<div
  v-if="visible"
  class="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pointer-events-none"
>
  <section
    class="pointer-events-auto w-full max-w-3xl rounded-[28px] border border-[#81d4fa]/60 bg-white/95 shadow-[0_24px_60px_-30px_rgba(2,136,209,0.45)] backdrop-blur-xl"
  >
```

- [ ] **Step 3: 重构头部为极简布局**

```vue
<header class="flex items-center justify-between px-5 py-4 border-b border-[#b3e5fc]/40">
  <h2 class="text-sm font-semibold text-[#0f4069]">AI 智能分析与搜索</h2>
  <button type="button" class="rounded-xl p-2 text-[#4f6b8a]" @click="emit('close')">
    <X class="h-4 w-4" />
  </button>
</header>
```

- [ ] **Step 4: 增加历史消息滚动区**

```vue
<div ref="messageContainerRef" class="max-h-[50vh] min-h-[220px] overflow-y-auto px-5 py-4">
  <div v-if="messages.length === 0" class="text-center text-sm text-[#6d88a3]">
    可以直接问当前页面内容
  </div>
  <div v-else class="space-y-4">
    <div
      v-for="message in messages"
      :key="message.id"
      class="flex"
      :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
    >
```

- [ ] **Step 5: 区分用户气泡与助手卡片**

```vue
<div
  v-if="message.role === 'user'"
  class="max-w-[80%] rounded-2xl bg-[#0288d1] px-4 py-3 text-sm leading-6 text-white"
>
  {{ message.text }}
</div>

<div
  v-else
  class="max-w-[88%] rounded-2xl border border-[#d8edf9] bg-[#f8fbfe] px-4 py-3 text-sm text-[#355878]"
>
```

- [ ] **Step 6: 运行构建验证 GREEN**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS，抽屉布局相关类型通过

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/PageAgentPanel.vue
git commit -m "feat: redesign page agent panel as bottom drawer"
```

### Task 3: 为回答内容补充 Markdown 渲染与复制按钮

**Files:**
- Modify: `apps/web/src/components/PageAgentPanel.vue`

- [ ] **Step 1: 引入 Markdown 渲染与清洗**

```ts
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

const renderMarkdown = (value: string): string => {
  const rawHtml = marked.parse(value, { breaks: true }) as string;
  return DOMPurify.sanitize(rawHtml);
};
```

- [ ] **Step 2: 在助手回答卡片中渲染 Markdown**

```vue
<div
  class="prose prose-slate max-w-none text-sm leading-6 prose-p:my-2 prose-strong:text-[#0f4069]"
  v-html="renderMarkdown(message.text)"
></div>
```

- [ ] **Step 3: 在每条助手消息上增加复制按钮**

```vue
<button
  type="button"
  class="rounded-lg px-2 py-1 text-xs text-[#4f6b8a] transition-colors hover:bg-white hover:text-[#01579b]"
  @click="emit('copy', message.text)"
>
  复制
</button>
```

- [ ] **Step 4: 在来源链接区保留简洁展示**

```vue
<div v-if="message.sources?.length" class="mt-3 space-y-2 border-t border-[#d8edf9] pt-3">
  <a
    v-for="source in message.sources"
    :key="`${source.type}-${source.url}-${source.title}`"
    :href="source.url"
    class="block rounded-xl bg-white px-3 py-2 text-sm text-[#0288d1] hover:text-[#01579b]"
  >
    {{ source.title }}
  </a>
</div>
```

- [ ] **Step 5: 运行构建验证**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS，回答不再显示原始 `**`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PageAgentPanel.vue
git commit -m "feat: render page agent answers as markdown"
```

### Task 4: 实现固定底部输入区与 Enter/Shift+Enter 交互

**Files:**
- Modify: `apps/web/src/components/PageAgentPanel.vue`

- [ ] **Step 1: 将输入区移动到面板底部并固定**

```vue
<footer class="border-t border-[#b3e5fc]/40 px-4 py-3">
  <div class="rounded-2xl border border-[#81d4fa]/70 bg-white px-3 py-2">
```

- [ ] **Step 2: 调整输入框为更紧凑样式，并在框内显示轻量提示**

```vue
<textarea
  :value="question"
  rows="2"
  class="max-h-28 min-h-[52px] w-full resize-none bg-transparent text-sm text-[#355878] outline-none"
  placeholder="问当前页面内容…  Enter 发送，Shift + Enter 换行"
  @input="emit('update:question', ($event.target as HTMLTextAreaElement).value)"
  @keydown="handleKeydown"
></textarea>
```

- [ ] **Step 3: 增加按键处理**

```ts
const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key !== "Enter") {
    return;
  }
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  if (!props.loading && props.question.trim()) {
    emit("submit");
  }
};
```

- [ ] **Step 4: 发送按钮改为箭头，分析中改为停止方框**

```vue
<button
  type="button"
  class="flex h-10 w-10 items-center justify-center rounded-full bg-[#0288d1] text-white"
  :disabled="!loading && !question.trim()"
  @click="loading ? emit('stop') : emit('submit')"
>
  <Square v-if="loading" class="h-4 w-4 fill-current" />
  <ArrowUp v-else class="h-4 w-4" />
</button>
```

- [ ] **Step 5: 运行构建验证**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS，支持 Enter 发送且面板布局稳定

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PageAgentPanel.vue
git commit -m "feat: add compact input composer for page agent"
```

### Task 5: 在 `App.vue` 中接入历史消息、复制和路由切换清空

**Files:**
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 增加历史消息状态与追加逻辑**

```ts
const pageAgentMessages = ref<PageAgentMessage[]>([]);

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
```

- [ ] **Step 2: 提交问题时改为写入历史，而不是覆盖单条结果**

```ts
const submitPageAgentQuestion = async (): Promise<void> => {
  const text = pageAgentQuestion.value.trim();
  if (!currentPageAgentContext.value || !text) {
    return;
  }
  appendUserMessage(text);
  pageAgentQuestion.value = "";
  pageAgentLoading.value = true;
  try {
    const result = await askPageAgent({
      ...currentPageAgentContext.value,
      question: text,
      selectionText: getSelectionText(),
    });
    appendAssistantMessage(result);
  } finally {
    pageAgentLoading.value = false;
  }
};
```

- [ ] **Step 3: 增加复制能力**

```ts
const copyPageAgentMessage = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};
```

- [ ] **Step 4: 在路由变化时清空当前会话**

```ts
watch(
  () => route.fullPath,
  () => {
    pageAgentQuestion.value = "";
    pageAgentMessages.value = [];
    pageAgentLoading.value = false;
  }
);
```

- [ ] **Step 5: 将新状态传给面板**

```vue
<PageAgentPanel
  :visible="pageAgentOpen"
  :loading="pageAgentLoading"
  :question="pageAgentQuestion"
  :messages="pageAgentMessages"
  @submit="submitPageAgentQuestion"
  @stop="pageAgentLoading = false"
  @copy="copyPageAgentMessage"
  @update:question="pageAgentQuestion = $event"
/>
```

- [ ] **Step 6: 运行构建验证**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS，页面切换后会话清空，历史消息正常显示

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.vue
git commit -m "feat: add page agent conversation history state"
```

### Task 6: 补充停止态处理与滚动体验

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/components/PageAgentPanel.vue`

- [ ] **Step 1: 增加前端忽略结果的停止标记**

```ts
const pageAgentRequestToken = ref(0);

const submitPageAgentQuestion = async (): Promise<void> => {
  const token = Date.now();
  pageAgentRequestToken.value = token;
  ...
  const result = await askPageAgent(...);
  if (pageAgentRequestToken.value !== token) {
    return;
  }
  appendAssistantMessage(result);
};

const stopPageAgentRequest = (): void => {
  pageAgentRequestToken.value = Date.now();
  pageAgentLoading.value = false;
};
```

- [ ] **Step 2: 在面板中新增自动滚动到底部**

```ts
const messageContainerRef = ref<HTMLElement | null>(null);

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    messageContainerRef.value?.scrollTo({
      top: messageContainerRef.value.scrollHeight,
      behavior: "smooth",
    });
  }
);
```

- [ ] **Step 3: 运行构建验证**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS，停止按钮和历史滚动行为正常

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.vue apps/web/src/components/PageAgentPanel.vue
git commit -m "feat: improve page agent stop and scroll behavior"
```

### Task 7: 最终验证与诊断检查

**Files:**
- Modify: `apps/web/src/components/PageAgentPanel.vue`
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: 运行前端构建**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/web`
Expected: PASS

- [ ] **Step 2: 运行后端构建，确保 UI 改版未影响接口依赖**

Run: `npm run build`
Working directory: `/opt/idapps/ai_web/apps/api`
Expected: PASS

- [ ] **Step 3: 检查主要文件诊断**

Run: 使用编辑器诊断检查以下文件
Expected:
- `apps/web/src/App.vue` 无新增错误
- `apps/web/src/components/PageAgentPanel.vue` 无新增错误
- `apps/web/src/page_agent/types.ts` 无新增错误

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.vue apps/web/src/components/PageAgentPanel.vue apps/web/src/page_agent/types.ts
git commit -m "test: verify page agent ui refine"
```

## 自检

### Spec 覆盖检查

- 去掉全屏蒙版：Task 2
- 底部居中抽屉：Task 2
- 提示文案减少：Task 2、Task 4
- 输入区固定到底部：Task 4
- Enter/Shift+Enter：Task 4
- 页面切换清空：Task 5
- Markdown 渲染：Task 3
- 历史问答：Task 2、Task 5
- 复制按钮：Task 3、Task 5
- 停止按钮：Task 4、Task 6

### 占位扫描

- 所有文件路径明确
- 每个任务都包含运行命令
- 所有改动步骤都给出实际代码片段
- 无 `TODO`、`TBD`、`后续补`

### 一致性检查

- 会话消息统一使用 `PageAgentMessage`
- 面板统一使用 `messages` 作为历史数据输入
- 发送与停止均由 `PageAgentPanel` 触发、`App.vue` 管理

