<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";

const props = defineProps<{
  surveyId: string;
}>();

const router = useRouter();
const route = useRoute();

const currentPage = computed<"edit" | "detail" | "stats">(() => {
  const path = route.path;
  if (path.includes("/stats")) return "stats";
  if (path.includes("/create")) return "edit";
  return "detail";
});

const navItems = [
  {
    key: "edit" as const,
    label: "编辑",
    icon: "✏️",
    to: `/ai-lab/survey/create?edit=${props.surveyId}`,
  },
  {
    key: "detail" as const,
    label: "发布",
    icon: "🚀",
    to: `/ai-lab/survey/${props.surveyId}`,
  },
  {
    key: "stats" as const,
    label: "统计",
    icon: "📊",
    to: `/ai-lab/survey/${props.surveyId}/stats`,
  },
];
</script>

<template>
  <div class="survey-nav-sidebar">
    <button
      v-for="item in navItems"
      :key="item.key"
      @click="router.push(item.to)"
      class="survey-nav-btn"
      :class="{ 'survey-nav-btn--active': currentPage === item.key }"
      :title="item.label"
    >
      <span class="survey-nav-btn__icon">{{ item.icon }}</span>
      <span class="survey-nav-btn__label">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.survey-nav-sidebar {
  position: fixed;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.survey-nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 56px;
  padding: 8px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.survey-nav-btn:hover {
  border-color: #06b6d4;
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.04);
}

.survey-nav-btn--active {
  border-color: #06b6d4;
  color: #06b6d4;
  background: rgba(6, 182, 212, 0.08);
  box-shadow: 0 1px 3px rgba(6, 182, 212, 0.15);
}

.survey-nav-btn__icon {
  font-size: 16px;
  line-height: 1;
}

.survey-nav-btn__label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
}

/* Hide on small screens */
@media (max-width: 768px) {
  .survey-nav-sidebar {
    display: none;
  }
}
</style>
