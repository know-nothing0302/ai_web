# Stats Feedback Mini Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feedback-type filter plus copy-content/contact actions to the existing feedback area in `统计信息` without expanding scope or touching backend APIs.

**Architecture:** Keep the current feedback API and permissions unchanged. Implement the feature entirely in `AdminStatsPage.vue` by adding one small filter state, passing the selected type to the existing feedback request, and adding two clipboard actions inside the existing feedback detail dialog with lightweight inline messages.

**Tech Stack:** Vue 3, TypeScript, existing Axios API client, browser clipboard API, Vite build

---

## File Map

- Modify: `apps/web/src/views/AdminStatsPage.vue`

## Implementation Notes

- Keep the change limited to the stats page.
- Do not add a new component, route, API method, or message system.
- Reuse existing `getAdminFeedbackList()` and existing feedback dialog.
- Keep copy feedback concise and page-local.
- This workspace is not a Git repository, so skip commit steps.

### Task 1: Add Feedback Type Filter

**Files:**
- Modify: `apps/web/src/views/AdminStatsPage.vue`

- [ ] **Step 1: Add the smallest possible filter state and option list**

In `apps/web/src/views/AdminStatsPage.vue`, append these declarations below `selectedFeedback`:

```ts
const feedbackTypeFilter = ref<"" | "bug" | "ux" | "content" | "other">("");

const feedbackTypeOptions = [
  { label: "全部", value: "" },
  { label: "问题报错", value: "bug" },
  { label: "体验建议", value: "ux" },
  { label: "内容建议", value: "content" },
  { label: "其他", value: "other" },
] as const;
```

- [ ] **Step 2: Pass the selected type to the existing feedback request**

Replace the `getAdminFeedbackList()` call inside `loadFeedbackList()` with:

```ts
    const result = await getAdminFeedbackList({
      ...params,
      type: feedbackTypeFilter.value || undefined,
      page: 1,
      pageSize: 10,
    });
```

- [ ] **Step 3: Refresh feedback when the filter changes**

Append this watcher below the existing `watch(statsRange, ...)` block:

```ts
watch(feedbackTypeFilter, async () => {
  if (!accessDenied.value) {
    await loadFeedbackList(resolveStatsRange(statsRange.value));
  }
});
```

- [ ] **Step 4: Add the filter control to the feedback header**

In the feedback section header, replace:

```vue
          <p class="text-sm text-[#4f6b8a]">最近 10 条</p>
```

with:

```vue
          <div class="flex items-center gap-3">
            <label class="text-sm text-[#4f6b8a]" for="feedback-type-filter">反馈类型</label>
            <select
              id="feedback-type-filter"
              v-model="feedbackTypeFilter"
              class="rounded-xl border border-[#b3e5fc] bg-white px-3 py-2 text-sm text-[#355878] outline-none transition-colors focus:border-[#4fc3f7]"
            >
              <option
                v-for="option in feedbackTypeOptions"
                :key="option.value || 'all'"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
```

- [ ] **Step 5: Run the web build**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 2: Add Copy Buttons To The Existing Feedback Dialog

**Files:**
- Modify: `apps/web/src/views/AdminStatsPage.vue`

- [ ] **Step 1: Add one tiny page-local message state**

Append this declaration below `feedbackTypeOptions`:

```ts
const feedbackActionMessage = ref("");
```

- [ ] **Step 2: Add a reusable local copy helper**

Append this function below `summarizeFeedback`:

```ts
const showFeedbackActionMessage = (value: string): void => {
  feedbackActionMessage.value = value;
  window.setTimeout(() => {
    if (feedbackActionMessage.value === value) {
      feedbackActionMessage.value = "";
    }
  }, 2000);
};

const copyFeedbackValue = async (value: string, successMessage: string): Promise<void> => {
  if (!value.trim()) {
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    showFeedbackActionMessage(successMessage);
  } catch {
    showFeedbackActionMessage("复制失败，请稍后重试");
  }
};
```

- [ ] **Step 3: Add copy buttons beside content and contact**

In the feedback dialog, replace the `反馈内容` block with:

```vue
            <div>
              <div class="flex items-center justify-between gap-3">
                <p class="text-[#6e89a3]">反馈内容</p>
                <button
                  type="button"
                  class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe]"
                  @click="void copyFeedbackValue(selectedFeedback.content, '已复制反馈内容')"
                >
                  复制反馈内容
                </button>
              </div>
              <p class="mt-1 whitespace-pre-wrap rounded-2xl bg-[#f8fbfe] px-4 py-3">
                {{ selectedFeedback.content }}
              </p>
            </div>
```

Replace the `联系方式` field with:

```vue
              <div>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[#6e89a3]">联系方式</p>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#0277bd] transition-colors hover:border-[#4fc3f7] hover:bg-[#e1f5fe] disabled:cursor-not-allowed disabled:border-[#d8edf9] disabled:text-[#9ab3c7] disabled:hover:bg-transparent"
                    :disabled="!selectedFeedback.contact?.trim()"
                    @click="
                      void copyFeedbackValue(
                        selectedFeedback.contact ?? '',
                        '已复制联系方式'
                      )
                    "
                  >
                    复制联系方式
                  </button>
                </div>
                <p class="mt-1">{{ selectedFeedback.contact || "未填写" }}</p>
              </div>
```

- [ ] **Step 4: Add a lightweight in-page success/failure message**

Append this block after the dialog:

```vue
      <div
        v-if="feedbackActionMessage"
        class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)]"
      >
        {{ feedbackActionMessage }}
      </div>
```

- [ ] **Step 5: Run diagnostics and the web build**

Run diagnostics on:

- `apps/web/src/views/AdminStatsPage.vue`

Then run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
No new diagnostics
> web@0.0.0 build
> vue-tsc -b && vite build
```

### Task 3: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the final web build one more time**

Run:

```bash
npm --prefix /opt/idapps/ai_web/apps/web run build
```

Expected:

```text
> web@0.0.0 build
> vue-tsc -b && vite build
```

- [ ] **Step 2: Manually verify the visible behavior**

Manual verification checklist:

```text
1. Open /admin/stats and confirm 用户反馈 defaults to 全部.
2. Switch the feedback filter to 问题报错, 体验建议, 内容建议, and 其他, and confirm the list refreshes each time.
3. Switch back to 全部 and confirm all recent feedback appears again.
4. Open 查看详情 and click 复制反馈内容; confirm the page shows 已复制反馈内容.
5. If the selected feedback has contact information, click 复制联系方式; confirm the page shows 已复制联系方式.
6. If the selected feedback has no contact information, confirm the copy-contact button is disabled.
7. Confirm the new interactions do not affect existing stats cards, trends, or rankings.
```

## Self-Review

- Spec coverage: The plan covers feedback type filtering, copy-content action, copy-contact action, lightweight messages, and final verification.
- Placeholder scan: No `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency: The plan consistently uses `feedbackTypeFilter`, `feedbackTypeOptions`, `feedbackActionMessage`, `showFeedbackActionMessage`, and `copyFeedbackValue`.
