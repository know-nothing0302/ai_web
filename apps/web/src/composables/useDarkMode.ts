import { ref, watch } from "vue";

const STORAGE_KEY = "ai-web-dark-mode";

export function useDarkMode() {
  const isDark = ref(localStorage.getItem(STORAGE_KEY) === "true");

  const apply = (dark: boolean): void => {
    document.documentElement.classList.toggle("dark", dark);
  };

  // Apply on init
  apply(isDark.value);

  watch(isDark, (dark) => {
    apply(dark);
    localStorage.setItem(STORAGE_KEY, dark ? "true" : "false");
  });

  const toggle = (): void => {
    isDark.value = !isDark.value;
  };

  return { isDark, toggle };
}
