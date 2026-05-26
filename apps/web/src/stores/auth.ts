import { defineStore } from "pinia";
import { ref } from "vue";
import { getCurrentUser, type User } from "../services/api";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  let pendingPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized.value) return;
    if (pendingPromise) return pendingPromise;

    pendingPromise = (async () => {
      loading.value = true;
      try {
        user.value = await getCurrentUser();
        initialized.value = true;
      } catch {
        user.value = null;
        initialized.value = true;
      } finally {
        loading.value = false;
        pendingPromise = null;
      }
    })();
    return pendingPromise;
  }

  return { user, loading, initialized, ensureInitialized };
});
