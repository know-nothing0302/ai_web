<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { ChevronUp } from "lucide-vue-next";

const visible = ref(false);
let scrollHandler: (() => void) | null = null;

onMounted(() => {
  scrollHandler = () => {
    visible.value = window.scrollY > window.innerHeight;
  };
  window.addEventListener("scroll", scrollHandler, { passive: true });
});

onUnmounted(() => {
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
  }
});

const scrollToTop = (): void => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};
</script>

<template>
  <transition name="back-to-top">
    <button
      v-if="visible"
      type="button"
      class="fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0288d1] text-white shadow-lg transition-all duration-300 hover:bg-[#0277bd] hover:shadow-xl active:scale-90"
      @click="scrollToTop"
      aria-label="回到顶部"
    >
      <ChevronUp class="h-5 w-5" />
    </button>
  </transition>
</template>

<style scoped>
.back-to-top-enter-active,
.back-to-top-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
