<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

onMounted(() => {
  void router.replace("/admin/publish");
});
</script>

<template>
  <div class="glass-panel rounded-2xl border p-8 text-center text-[#4f6b8a]">
    正在跳转到内容发布...
  </div>
</template>
