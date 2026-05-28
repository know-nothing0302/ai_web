<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Cake,
  Send,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-vue-next";
import {
  getBirthdayLogs,
  getBirthdayPreview,
  resendBirthdayPush,
  getBirthdayBlessing,
  updateBirthdayBlessing,
  searchBirthdayUsers,
  getCurrentUser,
  canAccessAdminViews,
  type BirthdayPushLogItem,
  type BirthdayPushResult,
  type SearchUserItem,
} from "../services/api";

// --- Access control ---
const loading = ref(true);
const accessDenied = ref(false);
const currentUserId = ref("");

// --- Push history ---
const logsLoading = ref(false);
const logs = ref<BirthdayPushLogItem[]>([]);
const totalLogs = ref(0);
const logPage = ref(1);
const logPageSize = 20;
const logKeyword = ref("");

// --- Manual push ---
const searchKeyword = ref("");
const searchResults = ref<SearchUserItem[]>([]);
const searchLoading = ref(false);
const selectedUser = ref<SearchUserItem | null>(null);
const blessingText = ref("");
const resendLoading = ref(false);
const previewLoading = ref(false);
const previewBase64 = ref("");
const previewError = ref("");
const pushResult = ref<BirthdayPushResult | null>(null);

// --- Blessing template ---
const blessingTemplate = ref("");
const blessingLoading = ref(false);
const blessingSaving = ref(false);
const blessingMessage = ref("");

// --- Computed pagination ---
const totalLogPages = ref(0);

const loadLogs = async () => {
  logsLoading.value = true;
  try {
    const result = await getBirthdayLogs({
      page: logPage.value,
      pageSize: logPageSize,
      keyword: logKeyword.value || undefined,
    });
    logs.value = result.items.map((item) => ({
      ...item,
      pushedAt: new Date(item.pushedAt).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
    totalLogs.value = result.pagination.total;
    totalLogPages.value = Math.ceil(totalLogs.value / logPageSize);
  } catch {
    logs.value = [];
  } finally {
    logsLoading.value = false;
  }
};

const nextLogPage = () => {
  if (logPage.value < totalLogPages.value) {
    logPage.value++;
    void loadLogs();
  }
};

const prevLogPage = () => {
  if (logPage.value > 1) {
    logPage.value--;
    void loadLogs();
  }
};

const handleLogSearch = () => {
  logPage.value = 1;
  void loadLogs();
};

// --- User search ---
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const handleSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer);
  const kw = searchKeyword.value.trim();
  if (kw.length < 2) {
    searchResults.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    searchLoading.value = true;
    try {
      searchResults.value = await searchBirthdayUsers(kw);
    } catch {
      searchResults.value = [];
    } finally {
      searchLoading.value = false;
    }
  }, 300);
};

const selectUser = (user: SearchUserItem) => {
  selectedUser.value = user;
  searchKeyword.value = `${user.xm} (${user.xh})`;
  searchResults.value = [];
  // Set default blessing
  blessingText.value = `亲爱的${user.xm}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！`;
};

const clearSelectedUser = () => {
  selectedUser.value = null;
  searchKeyword.value = "";
  blessingText.value = "";
};

// --- Resend ---
const handlePreview = async () => {
  if (!selectedUser.value || !blessingText.value.trim()) return;
  previewLoading.value = true;
  previewError.value = "";
  previewBase64.value = "";
  try {
    const result = await getBirthdayPreview({
      xm: selectedUser.value.xm,
      csrq: selectedUser.value.csrq || "",
      blessing: blessingText.value.trim(),
    });
    previewBase64.value = result.cardBase64;
  } catch (error: any) {
    previewError.value = error.response?.data?.message || "预览生成失败";
  } finally {
    previewLoading.value = false;
  }
};

const handleResend = async () => {
  if (!selectedUser.value || !blessingText.value.trim()) return;
  resendLoading.value = true;
  pushResult.value = null;
  try {
    const result = await resendBirthdayPush({
      xh: selectedUser.value.xh,
      blessing: blessingText.value.trim(),
    });
    pushResult.value = { status: "success", name: result.name, pushedTo: result.pushedTo || ["100002013029"] };
    await loadLogs();
  } catch (error: any) {
    pushResult.value = {
      status: "failed",
      name: selectedUser.value?.xm || "未知",
      errorDetail: error.response?.data?.detail || error.response?.data?.message || "推送失败",
    };
  } finally {
    resendLoading.value = false;
  }
};

// --- Blessing template ---
const loadBlessingTemplate = async () => {
  blessingLoading.value = true;
  try {
    const result = await getBirthdayBlessing();
    blessingTemplate.value = result.blessingTemplate;
  } catch {
    blessingTemplate.value = "";
  } finally {
    blessingLoading.value = false;
  }
};

const saveBlessingTemplate = async () => {
  if (!blessingTemplate.value.trim()) return;
  blessingSaving.value = true;
  blessingMessage.value = "";
  try {
    await updateBirthdayBlessing({ blessingTemplate: blessingTemplate.value.trim() });
    blessingMessage.value = "祝福语模板已更新";
    setTimeout(() => (blessingMessage.value = ""), 3000);
  } catch (error: any) {
    blessingMessage.value = error.response?.data?.message || "保存失败";
    setTimeout(() => (blessingMessage.value = ""), 3000);
  } finally {
    blessingSaving.value = false;
  }
};

onMounted(async () => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      accessDenied.value = true;
      return;
    }
    currentUserId.value = user.id?.trim() || user.username?.trim() || "";
    if (!canAccessAdminViews(user)) {
      accessDenied.value = true;
      return;
    }
  } catch {
    accessDenied.value = true;
    return;
  } finally {
    loading.value = false;
  }
  void loadLogs();
  void loadBlessingTemplate();
});
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8">
    <div v-if="loading" class="flex items-center justify-center py-32">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0288d1]"></div>
    </div>
    <section v-else-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
      <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
      <p class="mt-2 text-[#4f6b8a]">
        当前账号（{{ currentUserId || "未知用户" }}）无权限访问生日推送管理。
      </p>
    </section>

    <template v-else>
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold text-[#0f4069] flex items-center gap-3">
          <Cake class="w-8 h-8 text-[#0288d1]" />
          生日推送管理
        </h1>
        <p class="text-[#4f6b8a] mt-2">管理生日贺卡推送，查看推送历史，手动触发测试推送</p>
      </div>
    </div>

    <!-- Manual push form -->
    <section class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
      <h2 class="text-lg font-semibold text-[#0f4069] flex items-center gap-2 mb-5">
        <Send class="w-5 h-5 text-[#0288d1]" />
        手动推送（测试）
      </h2>

      <!-- User search -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-[#4f6b8a]">选择用户</label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8aa3bc]" />
            <input
              v-model="searchKeyword"
              type="text"
              class="input-ai pl-9 w-full"
              placeholder="搜索姓名或学号/工号..."
              @input="handleSearchInput"
              @focus="selectedUser = null"
            />
            <div
              v-if="searchResults.length > 0"
              class="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-[#b3e5fc] bg-white shadow-lg max-h-48 overflow-y-auto"
            >
              <button
                v-for="item in searchResults"
                :key="item.xh"
                type="button"
                class="w-full px-4 py-2.5 text-left text-sm text-[#355878] hover:bg-[#e1f5fe] transition-colors border-b border-[#f1faff] last:border-b-0"
                @click="selectUser(item)"
              >
                <span class="font-medium">{{ item.xm }}</span>
                <span class="text-[#8aa3bc] ml-2">{{ item.xh }}</span>
                <span v-if="item.csrq" class="text-[#8aa3bc] ml-2 text-xs">{{ item.csrq }}</span>
              </button>
            </div>
            <div
              v-if="searchLoading"
              class="absolute top-full left-0 right-0 mt-1 rounded-xl border border-[#b3e5fc] bg-white px-4 py-3 text-sm text-[#6e89a3] shadow-lg"
            >
              搜索中...
            </div>
          </div>
          <button
            v-if="selectedUser"
            type="button"
            class="btn-secondary text-sm"
            @click="clearSelectedUser"
          >
            清除
          </button>
        </div>
        <p v-if="selectedUser" class="text-xs text-green-600">
          已选择：{{ selectedUser.xm }} ({{ selectedUser.xh }})
        </p>
      </div>

      <!-- Blessing text -->
      <div class="mt-4 space-y-2">
        <label class="text-sm font-medium text-[#4f6b8a]">祝福语</label>
        <textarea
          v-model="blessingText"
          class="input-ai w-full min-h-[80px] text-sm leading-relaxed"
          placeholder="输入祝福语..."
        ></textarea>
      </div>

      <!-- Preview & Push buttons -->
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn-secondary flex items-center gap-2"
          :disabled="!selectedUser || !blessingText.trim() || previewLoading"
          @click="handlePreview"
        >
          <Eye class="w-4 h-4" />
          {{ previewLoading ? "生成预览中..." : "预览贺卡" }}
        </button>
        <button
          type="button"
          class="btn-primary flex items-center gap-2"
          :disabled="!selectedUser || !blessingText.trim() || resendLoading"
          @click="handleResend"
        >
          <MessageSquare class="w-4 h-4" />
          {{ resendLoading ? "推送中..." : "推送到测试账号 (100002013029)" }}
        </button>
      </div>

      <!-- Preview card display -->
      <div v-if="previewBase64" class="mt-4 rounded-2xl border border-[#b3e5fc] p-4 bg-white">
        <p class="text-sm text-[#4f6b8a] mb-3">贺卡预览</p>
        <img :src="previewBase64" alt="生日贺卡预览" class="max-w-full rounded-xl shadow-sm" />
        <p class="text-xs text-[#8aa3bc] mt-2">姓名：{{ selectedUser?.xm }} | 祝福语：{{ blessingText }}</p>
      </div>
      <p v-if="previewError" class="mt-2 text-sm text-red-500">{{ previewError }}</p>

      <!-- Push result card -->
      <div v-if="pushResult" class="mt-4 rounded-2xl border p-4"
        :class="pushResult.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'">
        <div class="flex items-center gap-2">
          <CheckCircle v-if="pushResult.status === 'success'" class="w-5 h-5 text-green-600" />
          <XCircle v-else class="w-5 h-5 text-red-500" />
          <span class="font-medium text-sm"
            :class="pushResult.status === 'success' ? 'text-green-700' : 'text-red-700'">
            {{ pushResult.status === 'success' ? '推送成功' : '推送失败' }}
          </span>
        </div>
        <div class="mt-2 text-sm space-y-1" :class="pushResult.status === 'success' ? 'text-green-600' : 'text-red-500'">
          <p>接收人：{{ pushResult.name }}</p>
          <p v-if="pushResult.pushedTo?.length">推送目标：{{ pushResult.pushedTo.join(', ') }}</p>
          <p v-if="pushResult.errorDetail">错误详情：{{ pushResult.errorDetail }}</p>
        </div>
      </div>
    </section>

    <!-- Blessing template editor -->
    <section class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
      <h2 class="text-lg font-semibold text-[#0f4069] flex items-center gap-2 mb-5">
        <MessageSquare class="w-5 h-5 text-[#0288d1]" />
        祝福语模板
      </h2>
      <p class="text-sm text-[#6e89a3] mb-3">使用 <code class="bg-[#e1f5fe] px-1 rounded text-[#0277bd]">{name}</code> 作为用户姓名占位符</p>
      <div class="space-y-2">
        <textarea
          v-if="!blessingLoading"
          v-model="blessingTemplate"
          class="input-ai w-full min-h-[80px] text-sm leading-relaxed"
          placeholder="祝福语模板..."
        ></textarea>
        <div v-else class="text-sm text-[#6e89a3]">加载中...</div>
      </div>
      <div class="mt-4">
        <button
          type="button"
          class="btn-primary"
          :disabled="!blessingTemplate.trim() || blessingSaving"
          @click="saveBlessingTemplate"
        >
          {{ blessingSaving ? "保存中..." : "保存模板" }}
        </button>
        <p v-if="blessingMessage" class="mt-2 text-sm" :class="blessingMessage.includes('已更新') ? 'text-green-600' : 'text-red-500'">
          {{ blessingMessage }}
        </p>
      </div>
    </section>

    <!-- Push history -->
    <section class="glass-panel rounded-3xl border p-6 md:p-8 shadow-sm">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <h2 class="text-lg font-semibold text-[#0f4069] flex items-center gap-2">
          <RefreshCw class="w-5 h-5 text-[#0288d1]" />
          推送历史
        </h2>
        <div class="flex items-center gap-3 w-full md:w-auto">
          <input
            v-model="logKeyword"
            type="text"
            class="input-ai flex-1 md:w-48 text-sm"
            placeholder="搜索姓名/学号..."
            @keyup.enter="handleLogSearch"
          />
          <button type="button" class="btn-secondary text-sm" @click="handleLogSearch">搜索</button>
          <button type="button" class="btn-secondary flex items-center gap-1 text-sm" @click="loadLogs">
            <RefreshCw class="w-3.5 h-3.5" />
            刷新
          </button>
        </div>
      </div>

      <div v-if="logsLoading" class="text-sm text-[#4f6b8a] py-8 text-center">加载中...</div>
      <div v-else-if="logs.length === 0" class="text-sm text-[#4f6b8a] py-8 text-center">暂无推送记录</div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-sm text-[#355878]">
          <thead>
            <tr class="border-b border-[#e1f5fe] text-left text-[#4f6b8a]">
              <th class="px-3 py-2">推送时间</th>
              <th class="px-3 py-2">姓名</th>
              <th class="px-3 py-2">学号/工号</th>
              <th class="px-3 py-2">生日</th>
              <th class="px-3 py-2">祝福语</th>
              <th class="px-3 py-2">贺卡</th>
              <th class="px-3 py-2">状态</th>
              <th class="px-3 py-2">推送目标</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in logs"
              :key="item.id"
              class="border-b border-[#f1faff] hover:bg-[#f8fbfe] transition-colors"
            >
              <td class="px-3 py-3 whitespace-nowrap">{{ item.pushedAt }}</td>
              <td class="px-3 py-3 font-medium">{{ item.xm }}</td>
              <td class="px-3 py-3 text-[#8aa3bc]">{{ item.userXh }}</td>
              <td class="px-3 py-3 text-[#8aa3bc]">{{ item.csrq || "--" }}</td>
              <td class="px-3 py-3 max-w-[200px] truncate" :title="item.blessingText || ''">
                {{ item.blessingText || "--" }}
              </td>
              <td class="px-3 py-3">
                <a
                  v-if="item.cardPath"
                  :href="item.cardPath"
                  target="_blank"
                  class="text-[#0288d1] hover:text-[#01579b] flex items-center gap-1"
                >
                  <ExternalLink class="w-3 h-3" />
                  预览
                </a>
                <span v-else class="text-[#8aa3bc]">--</span>
              </td>
              <td class="px-3 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                  :class="item.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
                >
                  {{ item.status === "success" ? "成功" : "失败" }}
                </span>
              </td>
              <td class="px-3 py-3 text-[#8aa3bc]">{{ item.pushedTo.join(", ") || "--" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalLogPages > 1" class="flex items-center justify-between pt-6 border-t border-[#b3e5fc]/50 mt-6">
        <p class="text-sm text-[#4f6b8a]">
          共 <span class="font-medium text-[#0f4069]">{{ totalLogs }}</span> 条记录
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="logPage === 1"
            class="p-1.5 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="prevLogPage"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <span class="text-sm text-[#0f4069] font-medium px-2">{{ logPage }} / {{ totalLogPages }}</span>
          <button
            type="button"
            :disabled="logPage === totalLogPages"
            class="p-1.5 rounded-lg border border-[#81d4fa] text-[#0288d1] hover:bg-[#e1f5fe] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="nextLogPage"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
    </template>
  </div>
</template>
