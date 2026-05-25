<script setup lang="ts">
import { onMounted, ref } from "vue";
import { canAccessAdminViews, getCurrentUser } from "../services/api";

const accessDenied = ref(false);

onMounted(async () => {
  try {
    const user = await getCurrentUser();
    if (!canAccessAdminViews(user)) {
      accessDenied.value = true;
    }
  } catch {
    accessDenied.value = true;
  }
});
const cards = [
  { icon: "🤖", title: "智能问答" },
  { icon: "📄", title: "文档助手" },
  { icon: "🎨", title: "创意生成" },
  { icon: "🔬", title: "数据分析" },
];
</script>

<template>
  <section v-if="accessDenied" class="glass-panel rounded-2xl border p-8 text-center">
    <h2 class="text-lg font-semibold text-[#0f4069]">无权限访问</h2>
    <p class="mt-2 text-[#4f6b8a]">
      当前账号不在 AI 试验场允许名单内。
    </p>
  </section>

  <div v-else class="ai-lab-page">
    <div class="grid-overlay"></div>

    <div class="text-center mb-12 relative z-10">
      <h1 class="text-4xl md:text-5xl font-bold mb-4">
        <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-400">
          AI 试验场
        </span>
      </h1>
      <p class="text-lg text-slate-400/80">探索人工智能的无限可能</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10">
      <div
        v-for="card in cards"
        :key="card.title"
        class="ai-lab-card group"
      >
        <div class="card-icon">{{ card.icon }}</div>
        <h3 class="card-title">{{ card.title }}</h3>
        <span class="coming-soon-badge">即将上线</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-lab-page {
  position: relative;
  min-height: calc(100vh - 10rem);
  padding: 3rem 1.5rem;
  border-radius: 1.5rem;
  overflow: hidden;
  background: linear-gradient(135deg, #0a1628 0%, #0f1f3d 50%, #0a1628 100%);
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(3, 169, 244, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(3, 169, 244, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.ai-lab-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1.5rem;
  border-radius: 1rem;
  text-align: center;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(6, 182, 212, 0.2);
  transition: all 0.35s ease;
  cursor: default;
}

.ai-lab-card:hover {
  border-color: rgba(6, 182, 212, 0.55);
  transform: translateY(-5px);
  box-shadow:
    0 0 24px rgba(6, 182, 212, 0.18),
    0 0 56px rgba(59, 130, 246, 0.10);
}

.card-icon {
  font-size: 2.75rem;
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(6, 182, 212, 0.25));
  transition: filter 0.35s ease;
}

.ai-lab-card:hover .card-icon {
  filter: drop-shadow(0 0 14px rgba(6, 182, 212, 0.5));
}

.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #e2e8f0;
}

.coming-soon-badge {
  display: inline-block;
  padding: 0.25rem 0.85rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  background: rgba(6, 182, 212, 0.12);
  color: #67e8f9;
  border: 1px solid rgba(6, 182, 212, 0.25);
}

@media (max-width: 640px) {
  .ai-lab-page {
    padding: 2rem 1rem;
  }
}
</style>
