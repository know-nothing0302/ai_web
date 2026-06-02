<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ClipboardCheck, AlertTriangle, X, Clock, Check, Loader2, Pencil, Search, RefreshCw } from "lucide-vue-next";
import {
  getAdminFeedbackEvalList,
  updateFeedbackStatus,
  getCurrentUser,
  type FeedbackListItem,
} from "../services/api";
import { canAccessAdminViews } from "../services/api";

// --- Constants ---
const PAGE_SIZES = [20, 50, 100];
const pageSize = ref(20);

const STATUS_TABS = [
  { key: "pending", label: "待处理" },
  { key: "evaluating", label: "评估中" },
  { key: "approved", label: "已批准" },
  { key: "in_progress", label: "处理中" },
  { key: "testing", label: "测试中" },
  { key: "deployed", label: "已部署" },
  { key: "verified", label: "已验证" },
  { key: "failed_testing", label: "测试失败" },
  { key: "reverted", label: "已回滚" },
  { key: "wontfix", label: "暂缓" },
  { key: "duplicate", label: "重复" },
  { key: "snoozed", label: "搁置" },
  { key: "processed", label: "已处理" },
] as const;

/** Statuses considered "processed" (non-pending, non-evaluating) */
const PROCESSED_STATUSES = [
  "approved", "in_progress", "testing", "deployed", "verified",
  "failed_testing", "reverted", "wontfix", "duplicate", "snoozed",
];

// --- State ---
const accessDenied = ref(false);
const activeTab = ref("pending");
const searchKeyword = ref("");
const submitting = ref(false);
const message = ref("");
const expandedId = ref<string | null>(null);
const rejectModal = ref<{ id: string; reason: string } | null>(null);
const editingNote = ref<{ id: string; note: string } | null>(null);
const currentUser = ref<Awaited<ReturnType<typeof getCurrentUser>>>(null);

interface TabState {
  items: FeedbackListItem[];
  page: number;
  total: number;
  loading: boolean;
  loaded: boolean;
}

const tabStates = ref<Record<string, TabState>>({});

function getTabState(key: string): TabState {
  if (!tabStates.value[key]) {
    tabStates.value[key] = { items: [], page: 1, total: 0, loading: false, loaded: false };
  }
  return tabStates.value[key];
}

const currentTab = computed(() => getTabState(activeTab.value));
const totalPages = computed(() => Math.max(1, Math.ceil(currentTab.value.total / pageSize.value)));

const today = new Date().toLocaleDateString("zh-CN", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
});

// --- Toast ---
const showMessage = (text: string) => {
  message.value = text;
  window.setTimeout(() => { message.value = ""; }, 2500);
};

// --- Labels ---
const severityLabel = (sev?: string): string => {
  const map: Record<string, string> = { P0: "P0-紧急", P1: "P1-严重", P2: "P2-重要", P3: "P3-一般", P4: "P4-轻微" };
  return sev ? (map[sev] ?? sev) : "未知";
};

const alignmentLabel = (align?: string): string => {
  const map: Record<string, string> = { in_scope: "范围内", out_of_scope: "范围外", edge: "边缘" };
  return align ? (map[align] ?? align) : "未知";
};

const fixScopeLabel = (scope?: string): string => {
  const map: Record<string, string> = { tiny: "微小改动", small: "小改动", medium: "中等改动", large: "大改动" };
  return scope ? (map[scope] ?? scope) : "未知";
};

const formatDateTime = (value?: string): string => {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

// --- Visual helpers ---
const evalBorderClass = (item: FeedbackListItem): string => {
  const action = item.evaluation?.suggestedAction;
  if (action === "auto_fix") return "border-[#a5d6a7]";
  if (action === "batch_review") return "border-[#ffe082]";
  if (action === "human_gate") return "border-[#ef9a9a]";
  return "border-[#d8edf9]";
};

const evalBgClass = (item: FeedbackListItem): string => {
  const action = item.evaluation?.suggestedAction;
  if (action === "auto_fix") return "bg-[#e8f5e9]/50";
  if (action === "batch_review") return "bg-[#fffde7]/50";
  if (action === "human_gate") return "bg-[#fff3e0]/50";
  return "bg-white/80";
};

const suggestionBgClass = (status: string): string =>
  ["evaluating", "approved"].includes(status)
    ? "bg-[#fff8e1] border-[#ffe082]"
    : "bg-[#f5f5f5] border-[#e0e0e0]";

const isActionable = (status: string): boolean =>
  ["pending", "evaluating"].includes(status);

// --- Data Loading ---
async function loadTab(key: string, page?: number) {
  const state = getTabState(key);
  if (page !== undefined) state.page = page;
  state.loading = true;
  try {
    // "processed" tab: fetch all non-pending statuses via comma-separated list
    const statusParam = key === "processed"
      ? PROCESSED_STATUSES.join(",")
      : key;
    const params: { status: string; page: number; pageSize: number; search?: string } = {
      status: statusParam,
      page: state.page,
      pageSize: pageSize.value,
    };
    if (searchKeyword.value.trim()) {
      params.search = searchKeyword.value.trim();
    }
    const result = await getAdminFeedbackEvalList(params);
    state.items = result.items;
    state.total = result.pagination.total;
    state.loaded = true;
  } catch {
    state.items = [];
    showMessage("加载失败");
  } finally {
    state.loading = false;
  }
}

function changeTab(key: string) {
  activeTab.value = key;
  if (!getTabState(key).loaded) {
    loadTab(key);
  }
}

function handleSearch() {
  const state = getTabState(activeTab.value);
  state.page = 1;
  state.loaded = false;
  loadTab(activeTab.value, 1);
}

function handleRefresh() {
  loadTab(activeTab.value);
}

// --- Status Actions ---
async function handleApprove(id: string) {
  submitting.value = true;
  try {
    await updateFeedbackStatus(id, { status: "approved" });
    showMessage("已批准");
    await loadTab(activeTab.value);
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
}

async function handleSnooze(id: string) {
  submitting.value = true;
  try {
    await updateFeedbackStatus(id, { status: "snoozed", adminNote: "已搁置，待后续评估" });
    showMessage("已搁置");
    await loadTab(activeTab.value);
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
}

function confirmReject(id: string) {
  rejectModal.value = { id, reason: "" };
}

async function submitReject() {
  if (!rejectModal.value) return;
  submitting.value = true;
  try {
    await updateFeedbackStatus(rejectModal.value.id, {
      status: "wontfix",
      adminNote: rejectModal.value.reason || undefined,
    });
    showMessage("已标记为暂缓");
    rejectModal.value = null;
    await loadTab(activeTab.value);
  } catch {
    showMessage("操作失败");
  } finally {
    submitting.value = false;
  }
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

// --- Admin Note Editing ---
function startEditNote(id: string, note?: string) {
  editingNote.value = { id, note: note || "" };
}

function cancelEditNote() {
  editingNote.value = null;
}

async function saveNote(id: string) {
  if (!editingNote.value) return;
  try {
    const updated = await updateFeedbackStatus(id, { adminNote: editingNote.value.note });
    const state = getTabState(activeTab.value);
    const idx = state.items.findIndex((item) => item.id === id);
    if (idx >= 0) {
      state.items[idx] = { ...state.items[idx], adminNote: updated.adminNote };
    }
    editingNote.value = null;
    showMessage("备注已保存");
  } catch {
    showMessage("保存失败");
  }
}

// --- Lifecycle ---
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
  await loadTab(activeTab.value);
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Access Denied -->
    <section v-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="mt-2 text-[#4f6b8a]">当前账号无权限访问反馈审批页面。</p>
    </section>

    <template v-else>
      <!-- Header -->
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs text-[#6e89a3] mb-2">
              <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5 text-[#0277bd]">管理</span>
              <span class="text-[#b3e5fc]">/</span>
              <span>反馈审批</span>
            </div>
            <h1 class="flex items-center gap-3 text-3xl font-bold text-[#0f4069]">
              <ClipboardCheck class="h-8 w-8 text-[#0288d1]" />
              反馈审批
            </h1>
            <p class="mt-2 text-sm text-[#4f6b8a]">
              {{ today }} · 当前 {{ STATUS_TABS.find((t) => t.key === activeTab)?.label }} {{ currentTab.total }} 条
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="relative">
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索反馈内容..."
                class="input-ai w-48 rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] placeholder:text-[#8aa3bc] focus:border-[#4fc3f7] focus:outline-none"
                @keyup.enter="handleSearch"
              />
            </div>
            <button
              type="button"
              class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe]"
              @click="handleSearch"
            >
              <Search class="inline-block w-3 h-3 mr-1" />搜索
            </button>
            <button
              type="button"
              class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:border-[#4fc3f7]"
              @click="handleRefresh"
            >
              <RefreshCw class="inline-block w-3 h-3 mr-1" />刷新
            </button>
          </div>
        </div>
      </section>

      <!-- Tab Bar -->
      <div class="glass-panel rounded-2xl border overflow-x-auto">
        <div class="flex min-w-max">
          <button
            v-for="tab in STATUS_TABS"
            :key="tab.key"
            type="button"
            class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 shrink-0"
            :class="activeTab === tab.key
              ? 'text-[#0277bd] border-[#0288d1] bg-[#e1f5fe]/50'
              : 'text-[#4f6b8a] border-transparent hover:text-[#0f4069] hover:bg-[#f3f8fc]'"
            @click="changeTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <!-- Loading -->
        <div v-if="currentTab.loading" class="py-12 text-center text-sm text-[#6e89a3]">
          加载中...
        </div>

        <!-- Empty -->
        <div v-else-if="currentTab.items.length === 0" class="py-12 text-center text-sm text-[#6e89a3]">
          暂无此状态的反馈
        </div>

        <!-- Card List -->
        <div v-else class="space-y-3">
          <div
            v-for="item in currentTab.items"
            :key="item.id"
            class="rounded-2xl border p-4 transition-colors"
            :class="[evalBorderClass(item), evalBgClass(item)]"
          >
            <!-- Card Header -->
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-[#355878]">#{{ item.id.slice(0, 8) }}</span>
                  <span class="truncate text-sm text-[#0f4069]">{{ item.pageTitle || item.pageRoute }}</span>
                </div>
                <p
                  class="mt-1 text-sm text-[#4f6b8a] break-words"
                  :class="expandedId === item.id ? '' : 'line-clamp-2'"
                >{{ item.content }}</p>
                <button
                  v-if="item.content.length > 80"
                  type="button"
                  class="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#0288d1] hover:text-[#01579b] hover:underline"
                  @click.stop="toggleExpand(item.id)"
                >
                  {{ expandedId === item.id ? '收起 ▲' : '展开全文 ▼' }}
                </button>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6e89a3]">
                  <span v-if="item.evaluation?.severity" class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                    {{ severityLabel(item.evaluation.severity) }}
                  </span>
                  <span v-if="item.evaluation?.fixScope" class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                    {{ fixScopeLabel(item.evaluation.fixScope) }}
                  </span>
                  <span v-if="item.evaluation?.alignment" class="rounded-full bg-[#e1f5fe] px-2 py-0.5">
                    {{ alignmentLabel(item.evaluation.alignment) }}
                  </span>
                  <span class="rounded-full bg-[#e1f5fe] px-2 py-0.5">{{ item.type }}</span>
                </div>
              </div>

              <!-- Action Buttons -->
              <div v-if="isActionable(item.status)" class="flex items-center gap-2 shrink-0">
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

            <!-- LLM Suggestion (Fix 3) -->
            <div
              v-if="item.evaluation?.suggestion"
              class="mt-3 rounded-xl border p-3"
              :class="suggestionBgClass(item.status)"
            >
              <div class="flex items-center gap-1.5 mb-1">
                <AlertTriangle class="w-3 h-3 text-[#f9a825]" />
                <span class="text-xs font-medium text-[#795548]" title="LLM：Large Language Model（大语言模型），AI 自动评估生成的建议">LLM 建议</span>
              </div>
              <p class="text-xs text-[#5d4037] leading-relaxed">{{ item.evaluation.suggestion }}</p>
            </div>

            <!-- Admin Note (Fix 3) -->
            <div class="mt-3">
              <div v-if="editingNote?.id === item.id" class="space-y-2">
                <textarea
                  v-model="editingNote.note"
                  class="input-ai w-full min-h-[60px] text-xs rounded-xl"
                  placeholder="审批意见..."
                ></textarea>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="rounded-full border border-[#4fc3f7] bg-[#e1f5fe] px-3 py-1 text-xs text-[#0277bd] hover:bg-[#b3e5fc]"
                    @click="saveNote(item.id)"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] px-3 py-1 text-xs text-[#4f6b8a] hover:bg-[#f3f8fc]"
                    @click="cancelEditNote"
                  >
                    取消
                  </button>
                </div>
              </div>
              <div v-else class="flex items-start gap-2 group">
                <div class="min-w-0 flex-1">
                  <span v-if="item.adminNote" class="text-xs text-[#4f6b8a]">{{ item.adminNote }}</span>
                  <span v-else class="text-xs text-[#b0bec5] italic">暂无审批意见</span>
                </div>
                <button
                  type="button"
                  class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 text-[#8aa3bc] hover:text-[#0277bd] hover:bg-[#e1f5fe]"
                  @click="startEditNote(item.id, item.adminNote)"
                >
                  <Pencil class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Expanded Details -->
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
                <p>建议操作：{{ item.evaluation.suggestedAction }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination (Fix 2) -->
        <div
          v-if="currentTab.total > pageSize"
          class="flex items-center justify-center gap-3 pt-6"
        >
          <select
            :value="pageSize"
            class="rounded-lg border border-[#b3e5fc] px-2 py-1.5 text-sm text-[#4f6b8a] bg-white focus:outline-none focus:border-[#4fc3f7]"
            @change="e => { pageSize = Number((e.target as HTMLSelectElement).value); loadTab(activeTab, 1); }"
          >
            <option v-for="ps in PAGE_SIZES" :key="ps" :value="ps">{{ ps }}条/页</option>
          </select>
          <button
            :disabled="currentTab.page <= 1"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed"
            @click="loadTab(activeTab, currentTab.page - 1)"
          >
            上一页
          </button>
          <span class="text-sm text-[#8aa3bc]">
            {{ currentTab.page }} / {{ totalPages }}（共 {{ currentTab.total }} 条）
          </span>
          <button
            :disabled="currentTab.page >= totalPages"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed"
            @click="loadTab(activeTab, currentTab.page + 1)"
          >
            下一页
          </button>
        </div>
      </section>
    </template>

    <!-- Reject Modal -->
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

    <!-- Toast -->
    <div
      v-if="message"
      class="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-[#b3e5fc] bg-white/96 px-4 py-2 text-sm text-[#0f4069] shadow-[0_12px_28px_-20px_rgba(15,64,105,0.45)]"
    >
      {{ message }}
    </div>
  </div>
</template>
