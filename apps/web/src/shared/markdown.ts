import DOMPurify from "dompurify";
import { marked } from "marked";

export const normalizeMarkdownForRender = (value?: string): string =>
  (value ?? "").replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**");

export const renderMarkdown = (value?: string): string => {
  const rawHtml = marked.parse(normalizeMarkdownForRender(value), { breaks: true }) as string;
  return typeof DOMPurify.sanitize === "function" ? DOMPurify.sanitize(rawHtml) : rawHtml;
};
