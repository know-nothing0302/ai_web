<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ClipboardCheck, AlertTriangle, X, Clock, Check, Loader2, Pencil, Search, RefreshCw } from "lucide-vue-next";
import {
  getAdminFeedbackEvalList,
  updateFeedbackStatus,
  getCurrentUser,
  type FeedbackListItem,
} from "../services/api";
import { canAccessAdminViews } from "../services/api";

// --- Simple Markdown renderer (for AI evaluation detailed_analysis) ---
const renderMarkdown = (md: string): string => {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, "<h4 class='font-semibold text-[#0f4069] mt-3 mb-1'>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3 class='font-bold text-[#0f4069] mt-3 mb-1'>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong class='text-[#0f4069]'>$1</strong>");
  html = html.replace(/^- (.+)$/gm, "<li class='ml-3'>$1</li>");
  html = html.replace(/\n/g, "<br>");
  return html;
};

// --- Constants ---
const PAGE_SIZES = [20, 50, 100];
const pageSize = ref(20);

/** Pipeline stages — maps DB statuses to user-facing pipeline columns */
const PIPELINE_STAGES = [
  { key: "inbox",     label: "待处理", icon: "📥", color: "#e3f2fd", borderColor: "#90caf9", statuses: ["pending", "evaluating", "snoozed"] },
  { key: "fixing",    label: "修复中", icon: "🔧", color: "#fff3e0", borderColor: "#ffcc80", statuses: ["approved", "in_progress", "failed_testing"] },
  { key: "testing",   label: "测试中", icon: "🧪", color: "#f3e5f5", borderColor: "#ce93d8", statuses: ["testing"] },
  { key: "deploying", label: "待部署", icon: "🚀", color: "#e0f2f1", borderColor: "#80cbc4", statuses: ["deployed"] },
  { key: "done",      label: "已完成", icon: "✅", color: "#e8f5e9", borderColor: "#a5d6a7", statuses: ["verified", "wontfix", "duplicate", "reverted"] },
];

/** Semantic labels for each DB status */
const STATUS_LABELS: Record<string, { label: string; icon: string }> = {
  pending:         { label: "等待评估",     icon: "⏳" },
  evaluating:      { label: "AI 评估中",   icon: "🤖" },
  snoozed:         { label: "已搁置",       icon: "💤" },
  approved:        { label: "等待修复",     icon: "📋" },
  in_progress:     { label: "正在修复",     icon: "🔧" },
  testing:         { label: "测试中",       icon: "🧪" },
  failed_testing:  { label: "⚠️ 测试未通过", icon: "❌" },
  deployed:        { label: "等待验证",     icon: "🚀" },
  verified:        { label: "已确认",       icon: "✅" },
  wontfix:         { label: "暂不处理",     icon: "🗄️" },
  duplicate:       { label: "重复反馈",     icon: "📎" },
  reverted:        { label: "已回滚",       icon: "↩️" },
};

/** Find which pipeline stage a given DB status belongs to */
function getStageForStatus(status: string) {
  return PIPELINE_STAGES.find((s) => s.statuses.includes(status));
}

/** Tailwind bg classes for kanban columns (light + dark) */
function stageKanbanBg(key: string): string {
  const map: Record<string, string> = {
    inbox:     "bg-[#e3f2fd] dark:bg-sky-950/40",
    fixing:    "bg-[#fff3e0] dark:bg-orange-950/40",
    testing:   "bg-[#f3e5f5] dark:bg-purple-950/40",
    deploying: "bg-[#e0f2f1] dark:bg-teal-950/40",
    done:      "bg-[#e8f5e9] dark:bg-green-950/40",
  };
  return map[key] ?? "";
}

// --- State ---
const accessDenied = ref(false);
const activeStage = ref("inbox");
const searchKeyword = ref("");
const submitting = ref(false);
const message = ref("");
const expandedId = ref<string | null>(null);
const rejectModal = ref<{ id: string; reason: string } | null>(null);
const approveModal = ref<{ id: string; note: string } | null>(null);
const editingNote = ref<{ id: string; note: string } | null>(null);
const currentUser = ref<Awaited<ReturnType<typeof getCurrentUser>>>(null);

// Pipeline kanban counts
const pipelineCounts = ref<Record<string, number>>({});
const pipelineCountsLoading = ref(false);
const failedTestingCount = ref(0);
const hasFailedTesting = computed(() => failedTestingCount.value > 0);

interface StageState {
  items: FeedbackListItem[];
  page: number;
  total: number;
  loading: boolean;
  loaded: boolean;
}

const stageStates = ref<Record<string, StageState>>({});

function getStageState(key: string): StageState {
  if (!stageStates.value[key]) {
    stageStates.value[key] = { items: [], page: 1, total: 0, loading: false, loaded: false };
  }
  return stageStates.value[key];
}

const currentStage = computed(() => getStageState(activeStage.value));
const totalPages = computed(() => Math.max(1, Math.ceil(currentStage.value.total / pageSize.value)));
const activeStageInfo = computed(() => PIPELINE_STAGES.find((s) => s.key === activeStage.value));

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
  ["pending", "evaluating", "snoozed"].includes(status);

// --- Data Loading ---

/** Fetch counts for all pipeline stages (lightweight: pageSize=1, only need total) */
async function loadPipelineCounts() {
  pipelineCountsLoading.value = true;
  try {
    const searchParam = searchKeyword.value.trim() ? { search: searchKeyword.value.trim() } : {};
    const results = await Promise.all([
      ...PIPELINE_STAGES.map((stage) =>
        getAdminFeedbackEvalList({
          status: stage.statuses.join(","),
          page: 1,
          pageSize: 1,
          ...searchParam,
        })
      ),
      // Separate query for failed_testing count (pulse indicator)
      getAdminFeedbackEvalList({
        status: "failed_testing",
        page: 1,
        pageSize: 1,
        ...searchParam,
      }),
    ]);
    PIPELINE_STAGES.forEach((stage, i) => {
      pipelineCounts.value[stage.key] = results[i].pagination.total;
    });
    failedTestingCount.value = results[PIPELINE_STAGES.length].pagination.total;
  } catch {
    // silent fail for background count refresh
  } finally {
    pipelineCountsLoading.value = false;
  }
}

async function loadStage(key: string, page?: number) {
  const state = getStageState(key);
  if (page !== undefined) state.page = page;
  state.loading = true;
  try {
    const stage = PIPELINE_STAGES.find((s) => s.key === key);
    const statusParam = stage ? stage.statuses.join(",") : key;
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

function changeStage(key: string) {
  activeStage.value = key;
  if (!getStageState(key).loaded) {
    loadStage(key);
  }
}

function handleSearch() {
  const state = getStageState(activeStage.value);
  state.page = 1;
  state.loaded = false;
  loadStage(activeStage.value, 1);
  loadPipelineCounts();
}

function handleRefresh() {
  loadStage(activeStage.value);
  loadPipelineCounts();
}

// --- Status Actions ---
function openApproveModal(id: string) {
  approveModal.value = { id, note: "" };
}

async function submitApprove() {
  if (!approveModal.value) return;
  submitting.value = true;
  try {
    await updateFeedbackStatus(approveModal.value.id, {
      status: "approved",
      adminNote: approveModal.value.note || undefined,
    });
    showMessage(approveModal.value.note ? "已批准（含补充指令）" : "已批准");
    approveModal.value = null;
    await loadStage(activeStage.value);
    loadPipelineCounts();
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
    await loadStage(activeStage.value);
    loadPipelineCounts();
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
    await loadStage(activeStage.value);
    loadPipelineCounts();
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
    const state = getStageState(activeStage.value);
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
let refreshTimer: number;

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
  await Promise.all([
    loadStage(activeStage.value),
    loadPipelineCounts(),
  ]);
  refreshTimer = window.setInterval(() => {
    loadPipelineCounts();
  }, 30000);
});

onBeforeUnmount(() => {
  clearInterval(refreshTimer);
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Access Denied -->
    <section v-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
      <h2 class="text-lg font-semibold text-[#0f4069] dark:text-[#e2e8f0]">无权限访问</h2>
      <p class="mt-2 text-[#4f6b8a] dark:text-[#cbd5e1]">当前账号无权限访问反馈审批页面。</p>
    </section>

    <template v-else>
      <!-- Header -->
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs text-[#6e89a3] dark:text-slate-400 mb-2">
              <span class="rounded-full bg-[#e1f5fe] dark:bg-slate-700/40 px-2 py-0.5 text-[#0277bd] dark:text-[#7dd3fc]">管理</span>
              <span class="text-[#b3e5fc] dark:text-slate-500">/</span>
              <span>反馈审批</span>
            </div>
            <h1 class="flex items-center gap-3 text-3xl font-bold text-[#0f4069] dark:text-[#e2e8f0]">
              <ClipboardCheck class="h-8 w-8 text-[#0288d1] dark:text-[#38bdf8]" />
              反馈审批
            </h1>
            <p class="mt-2 text-sm text-[#4f6b8a] dark:text-[#cbd5e1]">
              {{ today }} · 当前 {{ activeStageInfo?.icon }} {{ activeStageInfo?.label }} {{ currentStage.total }} 条
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="relative">
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索反馈内容..."
                class="input-ai w-48 rounded-full border border-[#b3e5fc] dark:border-slate-600 px-4 py-2 text-sm text-[#4f6b8a] dark:text-[#cbd5e1] placeholder:text-[#8aa3bc] dark:placeholder:text-slate-500 focus:border-[#4fc3f7] dark:focus:border-sky-600 focus:outline-none"
                @keyup.enter="handleSearch"
              />
            </div>
            <button
              type="button"
              class="rounded-full border border-[#b3e5fc] dark:border-slate-600 px-4 py-2 text-sm text-[#4f6b8a] dark:text-[#cbd5e1] transition-colors hover:bg-[#e1f5fe] dark:hover:bg-slate-700/50"
              @click="handleSearch"
            >
              <Search class="inline-block w-3 h-3 mr-1" />搜索
            </button>
            <button
              type="button"
              class="rounded-full border border-[#b3e5fc] dark:border-slate-600 px-4 py-2 text-sm text-[#4f6b8a] dark:text-[#cbd5e1] transition-colors hover:border-[#4fc3f7] dark:hover:border-sky-600"
              @click="handleRefresh"
            >
              <RefreshCw class="inline-block w-3 h-3 mr-1" />刷新
            </button>
          </div>
        </div>
      </section>

      <!-- Pipeline Kanban (NEW) -->
      <section class="glass-panel rounded-2xl border p-4">
        <div class="grid grid-cols-5 gap-3">
          <div
            v-for="stage in PIPELINE_STAGES"
            :key="stage.key"
            class="relative rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
            :class="[
              stageKanbanBg(stage.key),
              activeStage === stage.key
                ? 'ring-2 ring-[#0288d1] dark:ring-sky-600 shadow-sm'
                : '',
            ]"
            @click="changeStage(stage.key)"
          >
            <div class="flex items-center gap-2 mb-2">
              <span class="text-lg">{{ stage.icon }}</span>
              <span class="text-sm font-semibold text-[#0f4069] dark:text-[#e2e8f0]">{{ stage.label }}</span>
            </div>
            <!-- Pulse dot for failed_testing -->
            <span
              v-if="stage.key === 'fixing' && hasFailedTesting"
              class="absolute top-3 right-3 flex h-3 w-3"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <div class="text-2xl font-bold text-[#0f4069] dark:text-[#e2e8f0]">
              {{ pipelineCounts[stage.key] ?? "..." }}
            </div>
            <div class="text-xs text-[#6e89a3] dark:text-slate-400 mt-0.5">
              {{ stage.statuses.map(s => STATUS_LABELS[s]?.label ?? s).join(" · ") }}
            </div>
          </div>
        </div>
        <!-- Auto-refresh indicator -->
        <div class="mt-3 flex items-center justify-end gap-2 text-xs text-[#8aa3bc] dark:text-slate-500">
          <span v-if="pipelineCountsLoading" class="inline-block w-2 h-2 rounded-full bg-[#4fc3f7] animate-pulse"></span>
          <span>每 30 秒自动刷新</span>
        </div>
      </section>

      <!-- Stage Tab Bar -->
      <div class="glass-panel rounded-2xl border overflow-x-auto">
        <div class="flex min-w-max">
          <button
            v-for="stage in PIPELINE_STAGES"
            :key="stage.key"
            type="button"
            class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 shrink-0"
            :class="activeStage === stage.key
              ? 'text-[#0277bd] border-[#0288d1] bg-[#e1f5fe]/50 dark:text-[#7dd3fc] dark:border-sky-600 dark:bg-sky-900/30'
              : 'text-[#4f6b8a] border-transparent hover:text-[#0f4069] hover:bg-[#f3f8fc] dark:text-[#cbd5e1] dark:hover:text-[#e2e8f0] dark:hover:bg-slate-700/50'"
            @click="changeStage(stage.key)"
          >
            {{ stage.icon }} {{ stage.label }}
            <span
              v-if="pipelineCounts[stage.key] !== undefined"
              class="ml-1.5 text-xs opacity-60"
            >{{ pipelineCounts[stage.key] }}</span>
          </button>
        </div>
      </div>

      <!-- Stage Content -->
      <section class="glass-panel rounded-3xl border p-6 shadow-sm md:p-8">
        <!-- Loading -->
        <div v-if="currentStage.loading" class="py-12 text-center text-sm text-[#6e89a3] dark:text-slate-400">
          加载中...
        </div>

        <!-- Empty -->
        <div v-else-if="currentStage.items.length === 0" class="py-12 text-center text-sm text-[#6e89a3] dark:text-slate-400">
          暂无此阶段的反馈
        </div>

        <!-- Card List -->
        <div v-else class="space-y-3">
          <div
            v-for="item in currentStage.items"
            :key="item.id"
            class="rounded-2xl border p-4 transition-colors border-l-4"
            :class="[evalBorderClass(item), evalBgClass(item)]"
            :style="{ borderLeftColor: (getStageForStatus(item.status)?.borderColor ?? '#b3e5fc') }"
          >
            <!-- Card Header -->
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-[#355878] dark:text-slate-300">#{{ item.id.slice(0, 8) }}</span>
                  <span class="truncate text-sm text-[#0f4069] dark:text-[#e2e8f0]">{{ item.pageTitle || item.pageRoute }}</span>
                  <!-- DB Status Badge (NEW) -->
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    :style="{
                      backgroundColor: (getStageForStatus(item.status)?.color ?? '#f5f5f5'),
                      color: '#0f4069',
                    }"
                  >
                    {{ STATUS_LABELS[item.status]?.icon ?? "" }} {{ STATUS_LABELS[item.status]?.label ?? item.status }}
                  </span>
                </div>
                <p
                  class="mt-1 text-sm text-[#4f6b8a] dark:text-[#cbd5e1] break-words"
                  :class="expandedId === item.id ? '' : 'line-clamp-2'"
                >{{ item.content }}</p>
                <button
                  v-if="item.content.length > 80"
                  type="button"
                  class="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#0288d1] dark:text-[#38bdf8] hover:text-[#01579b] dark:hover:text-[#7dd3fc] hover:underline"
                  @click.stop="toggleExpand(item.id)"
                >
                  {{ expandedId === item.id ? '收起 ▲' : '展开全文 ▼' }}
                </button>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6e89a3] dark:text-slate-400">
                  <span v-if="item.evaluation?.severity" class="rounded-full bg-[#e1f5fe] dark:bg-slate-700/40 px-2 py-0.5">
                    {{ severityLabel(item.evaluation.severity) }}
                  </span>
                  <span v-if="item.evaluation?.fixScope" class="rounded-full bg-[#e1f5fe] dark:bg-slate-700/40 px-2 py-0.5">
                    {{ fixScopeLabel(item.evaluation.fixScope) }}
                  </span>
                  <span v-if="item.evaluation?.alignment" class="rounded-full bg-[#e1f5fe] dark:bg-slate-700/40 px-2 py-0.5">
                    {{ alignmentLabel(item.evaluation.alignment) }}
                  </span>
                  <span class="rounded-full bg-[#e1f5fe] dark:bg-slate-700/40 px-2 py-0.5">{{ item.type }}</span>
                  <span class="rounded-full bg-[#f3e5f5] dark:bg-purple-900/30 px-2 py-0.5">{{ item.userId }}{{ item.userDisplayName ? ` · ${item.userDisplayName}` : '' }}</span>
                </div>
              </div>

              <!-- Action Buttons -->
              <div v-if="isActionable(item.status)" class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  class="rounded-full border border-[#4fc3f7] dark:border-sky-600 bg-[#e1f5fe] dark:bg-sky-900/40 px-3 py-1.5 text-xs font-medium text-[#0277bd] dark:text-[#7dd3fc] transition-colors hover:bg-[#b3e5fc] dark:hover:bg-sky-800/50"
                  :disabled="submitting"
                  @click="openApproveModal(item.id)"
                >
                  <Check class="inline-block w-3 h-3 mr-1" />批准
                </button>
                <button
                  type="button"
                  class="rounded-full border border-[#ffcdd2] dark:border-red-800 px-3 py-1.5 text-xs text-[#c62828] dark:text-red-400 transition-colors hover:bg-[#ffebee] dark:hover:bg-red-950/40"
                  :disabled="submitting"
                  @click="confirmReject(item.id)"
                >
                  <X class="inline-block w-3 h-3 mr-1" />拒绝
                </button>
                <button
                  type="button"
                  class="rounded-full border border-[#b3e5fc] dark:border-slate-600 px-3 py-1.5 text-xs text-[#4f6b8a] dark:text-[#cbd5e1] transition-colors hover:bg-[#f3f8fc] dark:hover:bg-slate-700/50"
                  :disabled="submitting"
                  @click="handleSnooze(item.id)"
                >
                  <Clock class="inline-block w-3 h-3 mr-1" />搁置
                </button>
              </div>
            </div>

            <!-- LLM Suggestion -->
            <div
              v-if="item.evaluation?.suggestion"
              class="mt-3 rounded-xl border p-3"
              :class="suggestionBgClass(item.status)"
            >
              <div class="flex items-center gap-1.5 mb-1">
                <AlertTriangle class="w-3 h-3 text-[#f9a825]" />
                <span class="text-xs font-medium text-[#795548] dark:text-amber-300" title="LLM：Large Language Model（大语言模型），AI 自动评估生成的建议">LLM 建议</span>
              </div>
              <p class="text-xs text-[#5d4037] dark:text-amber-200/80 leading-relaxed">{{ item.evaluation.suggestion }}</p>
            </div>

            <!-- Admin Note -->
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
                    class="rounded-full border border-[#4fc3f7] dark:border-sky-600 bg-[#e1f5fe] dark:bg-sky-900/40 px-3 py-1 text-xs text-[#0277bd] dark:text-[#7dd3fc] hover:bg-[#b3e5fc] dark:hover:bg-sky-800/50"
                    @click="saveNote(item.id)"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-[#b3e5fc] dark:border-slate-600 px-3 py-1 text-xs text-[#4f6b8a] dark:text-[#cbd5e1] hover:bg-[#f3f8fc] dark:hover:bg-slate-700/50"
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
              <p><span class="text-[#6e89a3]">反馈者：</span>{{ item.userId }}<template v-if="item.userDisplayName"> · {{ item.userDisplayName }}</template></p>
              <p><span class="text-[#6e89a3]">提交时间：</span>{{ formatDateTime(item.createdAt) }}</p>
              <div v-if="item.evaluation" class="mt-2 rounded-xl bg-[#f8fbfe] p-3">
                <p class="font-medium text-[#0f4069]">AI 评估报告</p>
                <p>类型：{{ item.evaluation.evalType }}</p>
                <p>严重级别：{{ severityLabel(item.evaluation.severity) }}</p>
                <p>修改范围：{{ fixScopeLabel(item.evaluation.fixScope) }}</p>
                <p>对齐度：{{ alignmentLabel(item.evaluation.alignment) }}</p>
                <p>建议操作：{{ item.evaluation.suggestedAction }}</p>
                <div v-if="item.evaluation.detailedAnalysis" class="mt-2 p-3 rounded-lg bg-white dark:bg-slate-800/50 text-xs leading-relaxed whitespace-pre-wrap" v-html="renderMarkdown(item.evaluation.detailedAnalysis)" />
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div
          v-if="currentStage.total > pageSize"
          class="flex items-center justify-center gap-3 pt-6"
        >
          <select
            :value="pageSize"
            class="rounded-lg border border-[#b3e5fc] px-2 py-1.5 text-sm text-[#4f6b8a] bg-white focus:outline-none focus:border-[#4fc3f7]"
            @change="e => { pageSize = Number((e.target as HTMLSelectElement).value); loadStage(activeStage, 1); }"
          >
            <option v-for="ps in PAGE_SIZES" :key="ps" :value="ps">{{ ps }}条/页</option>
          </select>
          <button
            :disabled="currentStage.page <= 1"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed"
            @click="loadStage(activeStage, currentStage.page - 1)"
          >
            上一页
          </button>
          <span class="text-sm text-[#8aa3bc]">
            {{ currentStage.page }} / {{ totalPages }}（共 {{ currentStage.total }} 条）
          </span>
          <button
            :disabled="currentStage.page >= totalPages"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#e1f5fe] disabled:opacity-40 disabled:cursor-not-allowed"
            @click="loadStage(activeStage, currentStage.page + 1)"
          >
            下一页
          </button>
        </div>
      </section>
    </template>

    <!-- Approve Modal -->
    <div
      v-if="approveModal"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-[#0f4069]/18 px-4"
    >
      <section class="w-full max-w-md rounded-3xl border border-[#b3e5fc] bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-[#0f4069]">确认批准</h3>
        <p class="mt-2 text-sm text-[#4f6b8a]">可选：补充修复指令或注意事项，这些信息将传递给 AI 辅助修复。</p>
        <textarea
          v-model="approveModal.note"
          class="input-ai mt-4 w-full min-h-[100px] text-sm"
          placeholder="补充指令（可选）&#10;例如：该修复需要同时更新 /admin 页面的对应按钮..."
        ></textarea>
        <div class="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-full border border-[#b3e5fc] px-4 py-2 text-sm text-[#4f6b8a] transition-colors hover:bg-[#f3f8fc]"
            @click="approveModal = null"
            :disabled="submitting"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-full border border-[#4fc3f7] bg-[#e1f5fe] px-4 py-2 text-sm font-medium text-[#0277bd] transition-colors hover:bg-[#b3e5fc] disabled:opacity-50"
            :disabled="submitting"
            @click="submitApprove"
          >
            <Loader2 v-if="submitting" class="inline-block w-3 h-3 mr-1 animate-spin" />
            确认批准
          </button>
        </div>
      </section>
    </div>

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
