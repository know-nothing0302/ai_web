<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { BellRing, Tags, Zap, CheckCircle2 } from "lucide-vue-next";

import { buildSubscriptionContext, setPageAgentContext } from "../page_agent/context";
import {
  getCurrentUser,
  getMySubscriptions,
  listChannels,
  saveMySubscription,
  type Channel,
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
  // 每位用户只有一条订阅记录
  if (subscriptions.length > 0) {
    const sub = subscriptions[0];
    frequency.value = sub.frequency;
    channelCodes.value =
      sub.channelCodes.length > 0 ? sub.channelCodes : buildDefaultChannelCodes();
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
        <!-- 当前用户信息 — 无需展示 -->

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
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm font-medium text-[#0f4069]">
            <Zap class="w-4 h-4 text-[#0288d1]" />
            推送频率（三选一，互斥）
          </label>
          <div class="flex gap-2">
            <label
              v-for="option in frequencyOptions"
              :key="option.value"
              class="relative cursor-pointer flex-1"
            >
              <input type="radio" v-model="frequency" :value="option.value" class="peer sr-only" />
              <div class="px-3 py-2 rounded-lg border border-[#81d4fa]/70 bg-white text-center text-[#4f6b8a] peer-checked:border-[#0288d1] peer-checked:bg-[#e1f5fe] peer-checked:text-[#01579b] transition-all">
                <div class="text-sm font-medium">{{ option.label }}</div>
                <div class="text-[10px] opacity-60">{{ option.description }}</div>
              </div>
            </label>
          </div>
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
