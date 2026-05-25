<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ClipboardCheck, ExternalLink, AlertTriangle, Send, X, Clock, Check, Loader2 } from "lucide-vue-next";

import {
  getAdminFeedbackEvalList,
  updateFeedbackStatus,
  getCurrentUser,
  type FeedbackListItem,
} from "../services/api";
import { canAccessAdminViews } from "../services/api";

const accessDenied = ref(false);
const loading = ref(true);
const items = ref<FeedbackListItem[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const submitting = ref(false);
const message = ref("");
const expandedId = ref<string | null>(null);
const rejectModal = ref<{ id: string; reason: string } | null>(null);
const currentUser = ref<Awaited<ReturnType<typeof getCurrentUser>>>(null);

const showMessage = (text: string) => {
  message.value = text;
  window.setTimeout(() => { message.value = ""; }, 2500);
};

const today = new Date().toLocaleDateString("zh-CN", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
});

const groupKey = (item: FeedbackListItem): string => {
  return item.evaluation?.suggestedAction ?? "pending_eval";
};

const grouped = computed(() => {
  const groups: Record<string, FeedbackListItem[]> = {
    auto_fix: [],
    batch_review: [],
    human_gate: [],
    pending_eval: [],
  };
  for (const item of items.value) {
    const key = groupKey(item);
    if (groups[key]) {
      groups[key].push(item);
    } else {
      groups.human_gate.push(item);
    }
  }
  return groups;
});

const totalCount = computed(() => items.value.length);

const batchApproveEnabled = computed(() => selectedIds.value.size > 0 && !submitting.value);

const severityLabel = (sev?: string): string => {
  if (sev === "P0") return "P0-紧急";
  if (sev === "P1") return "P1-严重";
  if (sev === "P2") return "P2-重要";
  if (sev === "P3") return "P3-一般";
  if (sev === "P4") return "P4-轻微";
  return sev ?? "未知";
};

const alignmentLabel = (align?: string): string => {
  if (align === "in_scope") return "范围内";
  if (align === "out_of_scope") return "范围外";
  if (align === "edge") return "边缘";
  return align ?? "未知";
};

const fixScopeLabel = (scope?: string): string => {
  if (scope === "tiny") return "微小改动";
  if (scope === "small") return "小改动";
  if (scope === "medium") return "中等改动";
  if (scope === "large") return "大改动";
  return scope ?? "未知";
};

const formatDateTime = (value?: string): string => {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const toggleSelect = (id: string) => {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
};

const toggleSelectAll = () => {
  const batchReviewItems = grouped.value.batch_review;
  const allSelected = batchReviewItems.every((item) => selectedIds.value.has(item.id));
  const next = new Set(selectedIds.value);
  if (allSelected) {
    for (const item of batchReviewItems) {
      next.delete(item.id);
    }
  } else {
    for (const item of batchReviewItems) {
      next.add(item.id);
    }
  }
  selectedIds.value = next;
};

const allBatchSelected = computed(() => {
  const batchReviewItems = grouped.value.batch_review;
  return batchReviewItems.length > 0 && batchReviewItems.every((item) => selectedIds.value.has(item.id));
});

const loadList = async () => {
  loading.value = true;
  try {
    const result = await getAdminFeedbackEvalList({ page: 1, pageSize: 100 });
    items.value = result.items;
  } catch {
    items.value = [];
    showMessage("加载失败");
  } finally {
    loading.value = false;
  }
};

const batchApprove = async () => {
  if (selectedIds.value.size === 0) return;
  submitting.value = true;
  let success = 0;
  for (const id of selectedIds.value) {
    try {
      await updateFeedbackStatus(id, { status: "approved" });
      success++;
      const idx = items.value.findIndex((item) => item.id === id);
      if (idx >= 0) {
        items.value[idx] = { ...items.value[idx], status: "approved" };
      }
    } catch {
      // continue
    }
  }
  selectedIds.value = new Set();
  submitting.value = false;
  showMessage(`已批准 ${success}/${selectedIds.value.size} 条`);
  await loadList();
};

const handleApprove = async (id: string) => {
  submitting.value = true;
  try {
    await updateFeedbackStatus(id, { status: "approved" });
    const idx = items.value.findIndex((item) => item.id === id);
    if (idx >= 0) {
      items.value[idx] = { ...items.value[idx], status: "approved" };
    }
    showMessage("已批准");
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
};

const handleSnooze = async (id: string) => {
  submitting.value = true;
  try {
    await updateFeedbackStatus(id, { status: "snoozed", adminNote: "已搁置，待后续评估" });
    showMessage("已搁置");
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
};

const confirmReject = (id: string) => {
  rejectModal.value = { id, reason: "" };
};

const submitReject = async () => {
  if (!rejectModal.value) return;
  submitting.value = true;
  try {
    await updateFeedbackStatus(rejectModal.value.id, {
      status: "wontfix",
      adminNote: rejectModal.value.reason || undefined,
    });
    showMessage("已标记为暂缓");
    rejectModal.value = null;
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
};

const toggleExpand = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id;
};

onMounted(async () => {
  try {
    currentUser.value = await getCurrentUser();
  } catch {
    currentUser.value = null;
  }
  if (!canAccessAdminViews(currentUser.value)) {
    accessDenied.value = true;
    return;
  }
  await loadList();
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <section v-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="mt-2 text-[#4f6b8a]">当前账号无权限访问反馈审批页面。</p>
    </section>

    <template v-else>
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="flex items-center gap-3 text-3xl font-bold text-[#0f4069]">
              <ClipboardCheck class="h-8 w-8 text-[#0288d1]" />
              AI徐医反馈审批
            </h1>
            <p class="mt-2 text-sm text-[#4f6b8a]">
              {{ today }} · 共 {{ totalCount }} 条
            </p>
          </div>
          <button
            type="button"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:border-[#4fc3f7]"
            @click="loadList"
          >
            刷新
          </button>
        </div>
      </section>

      <div v-if="loading" class="glass-panel rounded-3xl border p-12 text-center text-sm text-[#6e89a3]">
        加载中...
      </div>

      <template v-else>
        <!-- 🟢 建议自动修复 -->
        <section
          v-if="grouped.auto_fix.length > 0"
          class="glass-panel rounded-3xl border p-6 shadow-sm"
        >
          <h2 class="flex items-center gap-2 text-lg font-semibold text-[#0f4069]">
            <span>🟢</span> 建议自动修复（{{ grouped.auto_fix.length }}条）
          </h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="item in grouped.auto_fix"
              :key="item.id"
              class="rounded-2xl border border-[#d8edf9] bg-white/80 p-4 transition-colors hover:border-[#b3e5fc]"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[#355878]">#{{ item.id.slice(0, 8) }}</span>
                    <span class="truncate text-sm text-[#0f4069]">{{ item.pageTitle || item.pageRoute }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm text-[#4f6b8a]">{{ item.content }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6e89a3]">
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                      {{ severityLabel(item.evaluation?.severity) }}
                    </span>
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                      {{ fixScopeLabel(item.evaluation?.fixScope) }}
                    </span>
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                      {{ alignmentLabel(item.evaluation?.alignment) }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="rounded-full border border-[#4fc3f7] bg-[#e1f5fe] px-3 py-1.5 text-xs font-medium text-[#0277bd] transition-colors hover:bg-[#b3e5fc]"
                    :disabled="submitting"
                    @click="handleApprove(item.id)"
                  >
                    <Check class="inline-block w-3 h-3 mr-1" />批准
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#ffcdd2] px-3 py-1.5 text-xs text-[#c62828] transition-colors hover:bg-[#ffebee]"
                    :disabled="submitting"
                    @click="confirmReject(item.id)"
                  >
                    <X class="inline-block w-3 h-3 mr-1" />拒绝
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1.5 text-xs text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc]"
                    :disabled="submitting"
                    @click="handleSnooze(item.id)"
                  >
                    <Clock class="inline-block w-3 h-3 mr-1" />搁置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 🟡 待审批 -->
        <section
          v-if="grouped.batch_review.length > 0"
          class="glass-panel rounded-3xl border p-6 shadow-sm"
        >
          <div class="flex items-center justify-between gap-4">
            <h2 class="flex items-center gap-2 text-lg font-semibold text-[#0f4069]">
              <span>🟡</span> 待审批（{{ grouped.batch_review.length }}条）
            </h2>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="rounded-full border border-[#b3e5fc] px-3 py-1.5 text-xs text-[#4f6b8a] transition-colors hover:border-[#4fc3f7]"
                @click="toggleSelectAll"
              >
                {{ allBatchSelected ? '取消全选' : '全选' }}
              </button>
              <button
                type="button"
                class="rounded-full border border-[#4fc3f7] bg-[#e1f5fe] px-3 py-1.5 text-xs font-medium text-[#0277bd] transition-colors hover:bg-[#b3e5fc] disabled:opacity-50"
                :disabled="!batchApproveEnabled"
                @click="batchApprove"
              >
                <Send class="inline-block w-3 h-3 mr-1" />批量批准（{{ selectedIds.size }}）
              </button>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <div
              v-for="item in grouped.batch_review"
              :key="item.id"
              class="rounded-2xl border border-[#d8edf9] bg-white/80 p-4 transition-colors hover:border-[#b3e5fc]"
              :class="{ 'border-[#4fc3f7] bg-[#e1f5fe]/40': selectedIds.has(item.id) }"
            >
              <div class="flex items-start gap-4">
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-[#b3e5fc] text-[#0288d1] focus:ring-[#0288d1]"
                  :checked="selectedIds.has(item.id)"
                  @change="toggleSelect(item.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[#355878]">#{{ item.id.slice(0, 8) }}</span>
                    <span class="truncate text-sm text-[#0f4069]">{{ item.pageTitle || item.pageRoute }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm text-[#4f6b8a]">{{ item.content }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6e89a3]">
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ severityLabel(item.evaluation?.severity) }}</span>
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ fixScopeLabel(item.evaluation?.fixScope) }}</span>
                    <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ alignmentLabel(item.evaluation?.alignment) }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-full border border-[#b3e5fc] px-3 py-1.5 text-xs text-[#4f6b8a] transition-colors hover:border-[#4fc3f7]"
                  @click="toggleExpand(item.id)"
                >
                  <ExternalLink class="inline-block w-3 h-3" />
                </button>
              </div>
              <div v-if="expandedId === item.id" class="mt-3 border-t border-[#e1f5fe] pt-3 space-y-2 text-xs text-[#4f6b8a]">
                <p><span class="text-[#6e89a3]">原文：</span>{{ item.content }}</p>
                <p><span class="text-[#6e89a3]">页面：</span>{{ item.pageTitle }}（{{ item.pageRoute }}）</p>
                <p><span class="text-[#6e89a3]">用户：</span>{{ item.userId }}</p>
                <p><span class="text-[#6e89a3]">提交时间：</span>{{ formatDateTime(item.createdAt) }}</p>
                <div v-if="item.evaluation" class="mt-2 rounded-xl bg-[#f8fbfe] p-3">
                  <p class="font-medium text-[#0f4069]">评估详情</p>
                  <p>类型：{{ item.evaluation.evalType }}</p>
                  <p>严重级别：{{ severityLabel(item.evaluation.severity) }}</p>
                  <p>修改范围：{{ fixScopeLabel(item.evaluation.fixScope) }}</p>
                  <p>对齐度：{{ alignmentLabel(item.evaluation.alignment) }}</p>
                  <p v-if="item.evaluation.suggestion">建议：{{ item.evaluation.suggestion }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 🔴 需人工确认 -->
        <section
          v-if="grouped.human_gate.length > 0"
          class="glass-panel rounded-3xl border p-6 shadow-sm"
        >
          <h2 class="flex items-center gap-2 text-lg font-semibold text-[#0f4069]">
            <span>🔴</span> 需人工确认（{{ grouped.human_gate.length }}条）
          </h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="item in grouped.human_gate"
              :key="item.id"
              class="rounded-2xl border border-[#ffcdd2] bg-white/80 p-4 transition-colors hover:border-[#ef9a9a]"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span v-if="item.evaluation?.alignment === 'out_of_scope'" class="inline-flex items-center gap-1 rounded-full bg-[#ffebee] px-2 py-0.5 text-xs font-medium text-[#c62828]">
                      <AlertTriangle class="w-3 h-3" /> 范围外
                    </span>
                    <span class="text-sm font-medium text-[#355878]">#{{ item.id.slice(0, 8) }}</span>
                    <span class="truncate text-sm text-[#0f4069]">{{ item.pageTitle || item.pageRoute }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm text-[#4f6b8a]">{{ item.content }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6e89a3]">
                    <span v-if="item.evaluation?.severity" class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ severityLabel(item.evaluation.severity) }}</span>
                    <span v-if="item.evaluation?.fixScope" class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ fixScopeLabel(item.evaluation.fixScope) }}</span>
                    <span class="rounded-full bg-[#ffebee] px-2 py-0.5">{{ alignmentLabel(item.evaluation?.alignment) }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="rounded-full border border-[#4fc3f7] bg-[#e1f5fe] px-3 py-1.5 text-xs font-medium text-[#0277bd] transition-colors hover:bg-[#b3e5fc]"
                    :disabled="submitting"
                    @click="handleApprove(item.id)"
                  >
                    <Check class="inline-block w-3 h-3 mr-1" />批准
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#ffcdd2] bg-[#ffebee] px-3 py-1.5 text-xs font-medium text-[#c62828] transition-colors hover:bg-[#ffcdd2]"
                    :disabled="submitting"
                    @click="confirmReject(item.id)"
                  >
                    <X class="inline-block w-3 h-3 mr-1" />拒绝
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1.5 text-xs text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc]"
                    :disabled="submitting"
                    @click="handleSnooze(item.id)"
                  >
                    <Clock class="inline-block w-3 h-3 mr-1" />搁置
                  </button>
                </div>
              </div>
              <div v-if="expandedId === item.id" class="mt-3 border-t border-[#e1f5fe] pt-3 space-y-2 text-xs text-[#4f6b8a]">
                <p><span class="text-[#6e89a3]">原文：</span>{{ item.content }}</p>
                <p><span class="text-[#6e89a3]">页面：</span>{{ item.pageTitle }}（{{ item.pageRoute }}）</p>
                <p><span class="text-[#6e89a3]">用户：</span>{{ item.userId }}</p>
                <p><span class="text-[#6e89a3]">提交时间：</span>{{ formatDateTime(item.createdAt) }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 🔵 待评估 -->
        <section
          v-if="grouped.pending_eval.length > 0"
          class="glass-panel rounded-3xl border p-6 shadow-sm"
        >
          <h2 class="flex items-center gap-2 text-lg font-semibold text-[#0f4069]">
            <span>🔵</span> 待评估（{{ grouped.pending_eval.length }}条）— cc-analysis 尚未完成
          </h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="item in grouped.pending_eval"
              :key="item.id"
              class="rounded-2xl border border-[#d8edf9] bg-white/80 p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <span class="text-sm font-medium text-[#355878]">#{{ item.id.slice(0, 8) }}</span>
                  <p class="mt-1 text-sm text-[#4f6b8a]">{{ item.content }}</p>
                  <p class="mt-1 text-xs text-[#6e89a3]">{{ item.pageTitle }} · {{ formatDateTime(item.createdAt) }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="items.length === 0"
          class="glass-panel rounded-3xl border p-12 text-center text-sm text-[#6e89a3]"
        >
          暂无待审批的反馈
        </div>
      </template>
    </template>

    <!-- 拒绝确认弹窗 -->
    <div
      v-if="rejectModal"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4"
    >
      <section class="w-full max-w-md rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-[#0f4069]">确认拒绝</h3>
        <p class="mt-2 text-sm text-[#4f6b8a]">将反馈标记为"暂缓（wontfix）"，建议填写拒绝原因。</p>
        <textarea
          v-model="rejectModal.reason"
          class="input-ai mt-4 w-full min-h-[80px] text-sm"
          placeholder="拒绝原因（可选）..."
        ></textarea>
        <div class="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc]"
            @click="rejectModal = null"
            :disabled="submitting"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-full border border-[#ffcdd2] bg-[#ffebee] px-4 py-2 text-sm font-medium text-[#c62828] transition-colors hover:bg-[#ffcdd2] disabled:opacity-50"
            :disabled="submitting"
            @click="submitReject"
          >
            <Loader2 v-if="submitting" class="inline-block w-3 h-3 mr-1 animate-spin" />
            确认拒绝
          </button>
        </div>
      </section>
    </div>

    <!-- 消息提示 -->
    <div
      v-if="message"
      class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)]"
    >
      {{ message }}
    </div>
  </div>
</template>
