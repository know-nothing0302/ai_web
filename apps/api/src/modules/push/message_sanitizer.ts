export const sanitizeWecomMarkdownText = (value: string): string =>
  value.replace(/\*/g, "").trim();
