import axios from "axios";
import * as cheerio from "cheerio";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { articleChannelStore } from "../../lib/store";

const aiExtractSchema = z.object({
  content: z.string().trim().min(80).max(5000),
  channelCode: z.string().trim().min(1).max(64),
  author: z.union([z.string().trim().max(200), z.literal("")]).optional(),
});

const aiSummarySchema = z.object({
  summary: z.string().trim().min(1).max(400),
});

type ServiceError = Error & { status?: number };

export interface UrlExtractResult {
  title?: string;
  content: string;
  sourceContent?: string;
  summary?: string;
  author?: string;
  channelCode?: string;
  originalUrl: string;
  publishedAt?: string;
  meta: {
    contentLength: number;
    missingFields: string[];
  };
}

const buildServiceError = (message: string, status: number): ServiceError => {
  const error = new Error(message) as ServiceError;
  error.status = status;
  return error;
};

const normalizeAiContent = (content: unknown): string => {
  let normalized = String(content ?? "").trim();
  if (normalized.includes("</think>")) {
    normalized = normalized.split("</think>").slice(-1)[0]?.trim() ?? normalized;
  }
  normalized = normalized.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (normalized.startsWith("```")) {
    normalized = normalized
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return normalized;
};

const normalizeSummary = (content: string): string => {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 250) {
    return normalized;
  }
  const window = normalized.slice(0, 250);
  const punctuationIndexes = ["。", "！", "？", "；"].map((mark) => window.lastIndexOf(mark));
  const cutIndex = Math.max(...punctuationIndexes);
  if (cutIndex >= 119) {
    return window.slice(0, cutIndex + 1).trim();
  }
  const trimmed = window.slice(0, 249).trim().replace(/[，、；：,.]*$/, "");
  return `${trimmed}。`;
};

const isMarkdownHeading = (line: string): boolean => /^#{2,4}\s+\S/.test(line);

const isMarkdownListItem = (line: string): boolean =>
  /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line);

const normalizeMarkdownEmphasis = (line: string): string =>
  line.replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**");

const expandEnumeratedParagraph = (line: string): string[] | null => {
  const markerPattern =
    /(一是|二是|三是|四是|五是|六是|七是|八是|九是|十是|首先|其次|再次|最后)/g;
  const segments = line.split(markerPattern).map((item) => item.trim());
  if (segments.length < 5 || segments[0] !== "") {
    return null;
  }
  const bullets: string[] = [];
  for (let index = 1; index < segments.length; index += 2) {
    const marker = segments[index];
    const body = segments[index + 1]?.replace(/^[：:，、]\s*/, "").trim();
    if (!marker || !body) {
      return null;
    }
    bullets.push(`- ${normalizeMarkdownEmphasis(body)}`);
  }
  return bullets.length >= 2 ? bullets : null;
};

const normalizeGeneratedMarkdown = (content: string): string => {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeMarkdownEmphasis(line.trimEnd()));
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      continue;
    }

    if (isMarkdownHeading(line)) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      normalized.push(line, "");
      continue;
    }

    if (isMarkdownListItem(line)) {
      const lastLine = normalized[normalized.length - 1] ?? "";
      if (lastLine !== "" && !isMarkdownListItem(lastLine)) {
        normalized.push("");
      }
      normalized.push(line);
      continue;
    }

    const expandedItems = expandEnumeratedParagraph(line);
    if (expandedItems) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      normalized.push(...expandedItems);
      continue;
    }

    normalized.push(line);
  }

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const collectMetaValues = ($: cheerio.CheerioAPI, name: string): string[] =>
  $(`meta[name="${name}"]`)
    .toArray()
    .map((element) => $(element).attr("content")?.trim() ?? "")
    .filter(Boolean);

/** Well-known preprint / academic aggregator hostnames → preferred source label */
const PREPRINT_HOSTNAME_MAP: Record<string, string> = {
  "arxiv.org": "arxiv.org",
  "www.arxiv.org": "arxiv.org",
  "export.arxiv.org": "arxiv.org",
  "biorxiv.org": "biorxiv.org",
  "www.biorxiv.org": "biorxiv.org",
  "medrxiv.org": "medrxiv.org",
  "www.medrxiv.org": "medrxiv.org",
  "chemrxiv.org": "chemrxiv.org",
  "www.chemrxiv.org": "chemrxiv.org",
  "researchsquare.com": "researchsquare.com",
  "www.researchsquare.com": "researchsquare.com",
};

const pickHostnameSource = (url: string): string | undefined => {
  try {
    const hostname = new URL(url).hostname;
    return PREPRINT_HOSTNAME_MAP[hostname];
  } catch {
    return undefined;
  }
};

const pickAuthor = ($: cheerio.CheerioAPI, url?: string): string | undefined => {
  // For preprint servers, prefer the hostname as the source label
  if (url) {
    const hostSource = pickHostnameSource(url);
    if (hostSource) return hostSource;
  }

  const institutions = [...new Set(collectMetaValues($, "citation_author_institution"))];
  if (institutions.length > 0) {
    return institutions[0];
  }
  const siteName = [
    $('meta[property="og:site_name"]').attr("content")?.trim(),
    $('meta[name="application-name"]').attr("content")?.trim(),
    $('meta[name="publisher"]').attr("content")?.trim(),
    $('meta[name="citation_journal_title"]').attr("content")?.trim(),
  ].find((item) => Boolean(item));
  if (siteName) {
    return siteName;
  }
  const citationAuthors = [...new Set(collectMetaValues($, "citation_author"))];
  if (citationAuthors.length > 0) {
    return citationAuthors.join(", ");
  }
  return [
    $('meta[name="author"]').attr("content")?.trim(),
    $('meta[property="article:author"]').attr("content")?.trim(),
    $('[rel="author"]').first().text().trim(),
    $('[itemprop="author"]').first().text().trim(),
    $(".author").first().text().trim(),
    $(".byline").first().text().trim(),
  ].find((item) => Boolean(item));
};

const pickPublishedAt = ($: cheerio.CheerioAPI): string | undefined =>
  parsePublishedAt(
    $('meta[property="article:published_time"]').attr("content") ||
      $('meta[name="article:published_time"]').attr("content") ||
      $('meta[name="citation_publication_date"]').attr("content") ||
      $('meta[name="citation_date"]').attr("content") ||
      $('meta[name="dc.date"]').attr("content") ||
      $('meta[name="dc.date.issued"]').attr("content") ||
      $('meta[name="pubdate"]').attr("content") ||
      $("time[datetime]").first().attr("datetime") ||
      $('meta[property="og:published_time"]').attr("content")
  );

const parseAiJson = (content: unknown): unknown => {
  const normalized = normalizeAiContent(content);
  const startedAt = normalized.indexOf("{");
  const endedAt = normalized.lastIndexOf("}");
  const candidate =
    startedAt >= 0 && endedAt > startedAt
      ? normalized.slice(startedAt, endedAt + 1)
      : normalized;
  return JSON.parse(candidate);
};

const parsePublishedAt = (value?: string): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }
  const normalized = value.trim();
  const dateOnlyMatch = normalized.match(
    /^(\d{4})[-/\s]+([A-Za-z]{3,9}|\d{1,2})[-/\s,]+(\d{1,2})$/
  );
  if (dateOnlyMatch) {
    const monthLookup: Record<string, number> = {
      january: 0,
      jan: 0,
      february: 1,
      feb: 1,
      march: 2,
      mar: 2,
      april: 3,
      apr: 3,
      may: 4,
      june: 5,
      jun: 5,
      july: 6,
      jul: 6,
      august: 7,
      aug: 7,
      september: 8,
      sep: 8,
      sept: 8,
      october: 9,
      oct: 9,
      november: 10,
      nov: 10,
      december: 11,
      dec: 11,
    };
    const year = Number(dateOnlyMatch[1]);
    const monthValue = dateOnlyMatch[2].toLowerCase();
    const day = Number(dateOnlyMatch[3]);
    const month =
      monthLookup[monthValue] ?? (Number(monthValue) >= 1 ? Number(monthValue) - 1 : NaN);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
      return new Date(Date.UTC(year, month, day)).toISOString();
    }
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

const buildPlainText = (html: string, url?: string): {
  title?: string;
  content: string;
  author?: string;
  publishedAt?: string;
} => {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, noscript").remove();
  const title =
    $("article h1").first().text().trim() ||
    $("main h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[name="citation_title"]').attr("content")?.trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim();
  const publishedAt = pickPublishedAt($);
  const author = pickAuthor($, url);
  const blocks = $("article p, main p, p")
    .toArray()
    .map((element) => $(element).text().trim())
    .filter((item) => item.length >= 12);
  return {
    title: title || undefined,
    content: blocks.join("\n\n").trim(),
    author: author || undefined,
    publishedAt,
  };
};

const buildPrompt = (
  title: string | undefined,
  content: string,
  author: string | undefined,
  channels: Array<{ code: string; name: string }>
): string => `
你是内容中枢资深编辑。请基于标题和正文素材输出可直接发布的结构化结果，只返回 JSON：
{"content":"可发布中文正文","channelCode":"...","author":"..."}

要求：
1. content 必须是适合发布的中文成稿，使用中文重写，不要直接照抄网页段落。
2. 开头必须输出一段简短导语，用一句到两句说明文章主题和价值，不要使用“本文主要介绍”等空泛表述。
3. 必须形成 2 到 5 个主章节，核心主题使用 Markdown 二级标题（##），标题要具体，不能使用“内容概述”“相关介绍”这类空泛标题。
4. 对长章节必须拆成子标题（###）或 Markdown 列表；原文中的并列子点、举措或“一是/二是/三是”等内容，必须拆开呈现，不要压成一整段。
5. 标题、正文、列表之间必须保留空行；每段控制在 2-4 句，遇到长段落必须主动拆分。
6. 关键事实和数字必须突出；对关键结论、数据、疾病名称、方法名称、风险点或应用价值使用 Markdown 加粗标记，但不要整句滥用加粗。
7. 正文应尽量完整，充分覆盖素材中的核心背景、关键发现、应用价值和局限信息；若素材中不存在某部分，不要编造。
8. 删除广告、导航、免责声明、版权尾注和无关信息。
9. 不得编造页面中不存在的事实、时间、作者或数据，也不要把全文改写成提纲式简报。
10. author 优先依据页面作者信息返回机构名称；若无法确认机构则返回站点名称；都无法确认时返回空字符串。
11. channelCode 只能从给定栏目中选择一个。
12. 只返回 JSON，不要解释，不要使用 Markdown 代码块。

栏目候选：
${channels.map((item) => `${item.code}: ${item.name}`).join("\n")}

标题：
${title ?? ""}

页面作者候选：
${author ?? ""}

正文：
${content.slice(0, 8000)}
`;

const buildSummaryPrompt = (content: string): string =>
  `请将以下内容提炼为120-180字中文摘要，要求简洁、准确、可发布，保留核心结论与应用价值，不要分点，不要添加标题：\n${content}`;

const requestAiExtraction = async (
  title: string | undefined,
  content: string,
  author: string | undefined
): Promise<z.infer<typeof aiExtractSchema>> => {
  if (!env.deepseekApiBaseUrl) {
    throw buildServiceError("未配置 DEEPSEEK_API_BASE_URL", 502);
  }
  const channels = await articleChannelStore.list(true);
  const prompt = buildPrompt(title, content, author, channels);
  const startedAt = Date.now();
  try {
    const result = await axios.post(
      `${env.deepseekApiBaseUrl}/v1/chat/completions`,
      {
        model: env.deepseekModel,
        messages: [
          {
            role: "system",
            content: "你是内容结构化提取助手，只返回 JSON。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      },
      {
        headers: env.deepseekApiKey
          ? {
              Authorization: `Bearer ${env.deepseekApiKey}`,
            }
          : undefined,
        timeout: 60000,
      }
    );
    logger.info("article.extract.ai.extract.success", {
      durationMs: Date.now() - startedAt,
      channelCount: channels.length,
    });
    const payload = parseAiJson(result.data?.choices?.[0]?.message?.content);
    const parsed = aiExtractSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error("article.extract.ai.extract.invalid_payload", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        payloadPreview: normalizeAiContent(result.data?.choices?.[0]?.message?.content).slice(
          0,
          500
        ),
      });
      throw buildServiceError("AI 提取结果格式错误", 502);
    }
    const matchedChannel = channels.find((item) => item.code === parsed.data.channelCode);
    if (!matchedChannel) {
      throw buildServiceError("AI 返回了无效栏目", 502);
    }
    return {
      ...parsed.data,
      content: normalizeGeneratedMarkdown(parsed.data.content),
    };
  } catch (error) {
    logger.error("article.extract.ai.extract.failed", {
      error,
    });
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      throw buildServiceError("AI 提取超时", 504);
    }
    if ((error as ServiceError).status) {
      throw error;
    }
    throw buildServiceError("AI 提取失败", 502);
  }
};

const requestAiSummary = async (content: string): Promise<string> => {
  const startedAt = Date.now();
  try {
    const result = await axios.post(
      `${env.deepseekApiBaseUrl}/v1/chat/completions`,
      {
        model: env.deepseekModel,
        messages: [
          {
            role: "system",
            content: "你是教育行业AI资讯编辑助手，输出简洁、准确、可发布摘要。",
          },
          {
            role: "user",
            content: buildSummaryPrompt(content),
          },
        ],
        temperature: 0.2,
      },
      {
        headers: env.deepseekApiKey
          ? {
              Authorization: `Bearer ${env.deepseekApiKey}`,
            }
          : undefined,
        timeout: 60000,
      }
    );
    const payload = {
      summary: normalizeAiContent(result.data?.choices?.[0]?.message?.content),
    };
    const parsed = aiSummarySchema.safeParse(payload);
    if (!parsed.success) {
      logger.error("article.extract.ai.summary.invalid_payload", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      throw buildServiceError("AI 摘要结果格式错误", 502);
    }
    logger.info("article.extract.ai.summary.success", {
      durationMs: Date.now() - startedAt,
      summaryLength: parsed.data.summary.length,
    });
    return normalizeSummary(parsed.data.summary);
  } catch (error) {
    logger.error("article.extract.ai.summary.failed", {
      error,
    });
    if ((error as ServiceError).status) {
      throw error;
    }
    throw buildServiceError("AI 摘要失败", 502);
  }
};

export const extractArticleFromUrl = async (input: {
  url: string;
  requestUserId?: string;
}): Promise<UrlExtractResult> => {
  logger.info("article.extract.start", {
    url: input.url,
    requestUserId: input.requestUserId,
  });
  const startedAt = Date.now();
  let html = "";
  try {
    const fetchResult = await axios.get<string>(input.url, {
      responseType: "text",
      timeout: 10000,
    });
    html = fetchResult.data;
    logger.info("article.extract.fetch.success", {
      url: input.url,
      fetchDurationMs: Date.now() - startedAt,
      htmlLength: html.length,
    });
  } catch (error) {
    logger.error("article.extract.fetch.failed", {
      url: input.url,
      error,
    });
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      throw buildServiceError("网页抓取超时", 504);
    }
    throw buildServiceError("网页抓取失败", 502);
  }

  const extracted = buildPlainText(html, input.url);
  logger.info("article.extract.clean.success", {
    url: input.url,
    contentLength: extracted.content.length,
    hasTitle: Boolean(extracted.title),
    hasAuthor: Boolean(extracted.author),
    hasPublishedAt: Boolean(extracted.publishedAt),
  });
  logger.info("article.extract.author.detected", {
    url: input.url,
    author: extracted.author,
  });
  if (extracted.content.length < 80) {
    throw buildServiceError("正文内容不足，无法完成自动提取", 422);
  }

  const aiResult = await requestAiExtraction(
    extracted.title,
    extracted.content,
    extracted.author
  );
  const summary = await requestAiSummary(aiResult.content);
  const missingFields = [
    !extracted.title ? "title" : "",
    !extracted.publishedAt ? "publishedAt" : "",
    !summary ? "summary" : "",
    !aiResult.content ? "content" : "",
    !aiResult.channelCode ? "channelCode" : "",
    !(aiResult.author || extracted.author) ? "author" : "",
  ].filter(Boolean);

  // Preprint servers (arxiv etc.): always use the hostname as the source label,
  // overriding both AI and HTML extraction — paper IDs are not author names.
  const preprintSource = pickHostnameSource(input.url);

  return {
    title: extracted.title,
    content: aiResult.content,
    sourceContent: extracted.content,
    summary,
    author: preprintSource || aiResult.author || extracted.author,
    channelCode: aiResult.channelCode,
    originalUrl: input.url,
    publishedAt: extracted.publishedAt,
    meta: {
      contentLength: extracted.content.length,
      missingFields,
    },
  };
};
