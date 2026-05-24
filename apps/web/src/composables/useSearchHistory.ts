import { ref } from "vue";

const STORAGE_KEY = "ai-web-search-history";
const MAX_ITEMS = 20;

export function useSearchHistory() {
  const searchHistory = ref<string[]>(loadHistory());

  function loadHistory(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  function addSearchHistory(keyword: string): void {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...searchHistory.value.filter((k) => k !== trimmed)].slice(
      0,
      MAX_ITEMS
    );
    searchHistory.value = updated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function clearHistory(): void {
    searchHistory.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return { searchHistory, addSearchHistory, clearHistory };
}
