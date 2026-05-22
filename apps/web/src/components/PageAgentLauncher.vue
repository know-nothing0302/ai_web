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

<template>
  <div
    class="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
    :class="[
      isHovered ? 'scale-105 opacity-100 translate-y-0' : 'scale-100 opacity-95 translate-y-1',
      introActive ? 'animate-[page-agent-intro_1.6s_ease-out_1]' : '',
    ]"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')"
  >
    <div class="relative group">
      <div
        class="absolute -inset-1 bg-gradient-to-r from-[#b3e5fc] to-[#81d4fa] rounded-full blur transition-all duration-700"
        :class="
          isHovered
            ? 'opacity-70 scale-105'
            : 'opacity-35 scale-100 animate-[page-agent-breathe_3.2s_ease-in-out_infinite]'
        "
      ></div>

      <button
        type="button"
        class="relative flex items-center gap-3 px-6 py-3 rounded-full bg-white/95 backdrop-blur-xl border border-[#0288d1]/25 text-[#0f4f80] shadow-[0_20px_35px_-20px_rgba(2,136,209,0.45)] transition-all duration-300 hover:-translate-y-0.5"
        @click="$emit('click')"
      >
        <span class="text-sm font-medium tracking-wide">AI 智能分析与搜索</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes page-agent-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.32;
  }

  50% {
    transform: scale(1.04);
    opacity: 0.42;
  }
}

@keyframes page-agent-intro {
  0% {
    transform: translateY(10px) scale(0.98);
    opacity: 0.88;
  }

  60% {
    transform: translateY(-2px) scale(1.02);
    opacity: 0.97;
  }

  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
