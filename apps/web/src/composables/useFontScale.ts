import { ref, watch } from "vue";

const STORAGE_KEY = "ai-web-font-scale";

export function useFontScale() {
  const fontScale = ref(Number(localStorage.getItem(STORAGE_KEY)) || 0);

  const SCALES = [
    { value: -1, label: "小", css: { fontSize: "0.875rem", lineHeight: "1.5" } },
    { value: 0, label: "中", css: { fontSize: "1rem", lineHeight: "1.65" } },
    { value: 1, label: "大", css: { fontSize: "1.125rem", lineHeight: "1.8" } },
  ];

  const currentScale = () => SCALES.find((s) => s.value === fontScale.value) ?? SCALES[1];

  const apply = (scale: number): void => {
    const config = SCALES.find((s) => s.value === scale) ?? SCALES[1];
    document.documentElement.style.setProperty("--font-base-size", config.css.fontSize);
    document.documentElement.style.setProperty("--font-line-height", config.css.lineHeight);
  };

  // Apply on init
  apply(fontScale.value);

  watch(fontScale, (scale) => {
    apply(scale);
    localStorage.setItem(STORAGE_KEY, String(scale));
  });

  const setScale = (value: number): void => {
    fontScale.value = value;
  };

  return { fontScale, SCALES, currentScale, setScale };
}
