export const sanitizeCardText = (value?: string): string =>
  (value ?? "").replace(/\*/g, "").trim();
