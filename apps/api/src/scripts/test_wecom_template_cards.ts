import { readdir } from "node:fs/promises";
import path from "node:path";
import { closeDb, initDb, query } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { pushRecordStore } from "../lib/store.js";
import { wecomClient } from "../modules/wecom/client.js";
import { env } from "../config/env.js";

type ArgsMap = Record<string, string>;

type ArticleRow = {
  id: string;
  title: string;
  summary: string;
  author: string;
  channel_code: string | null;
  channel_name: string | null;
  category: string;
  published_at: string | null;
  updated_at: string;
};

type ArticlePreview = {
  id: string;
  title: string;
  summary: string;
  author: string;
  channelLabel: string;
  url: string;
};
type DigestRecordInput = {
  touser: string;
  articles: ArticlePreview[];
  messageType: string;
  title: string;
  summary: string;
  url: string;
  requestPayload: Record<string, unknown>;
};
type BuiltTemplateCard = {
  title: string;
  summary: string;
  url: string;
  templateCard: Record<string, unknown>;
};

const parseArgs = (argv: string[]): ArgsMap => {
  const result: ArgsMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const inline = current.split("=", 2);
    if (inline.length === 2) {
      result[inline[0].slice(2)] = inline[1];
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[current.slice(2)] = "true";
      continue;
    }
    result[current.slice(2)] = next;
    index += 1;
  }
  return result;
};

const getArg = (args: ArgsMap, key: string): string =>
  (args[key] ?? process.env[key.toUpperCase().replace(/-/g, "_")] ?? "").trim();

const toPositiveInt = (value: string, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const trimToLength = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
};

const buildArticleUrl = (articleId: string): string =>
  `${env.webBaseUrl.replace(/\/+$/, "")}/articles/${articleId}`;

const buildTodayDigestUrl = (): string =>
  `${env.webBaseUrl.replace(/\/+$/, "")}/push-digests/today`;

const buildPublicImageUrl = (fileName: string): string =>
  `${env.webBaseUrl.replace(/\/+$/, "")}/images/${encodeURIComponent(fileName)}`;

const resolveTargetUserId = async (inputUserId: string): Promise<string> => {
  if (inputUserId) {
    return inputUserId;
  }
  const result = await query<{ qywx_user_id: string }>(
    `
    SELECT qywx_user_id
    FROM subscriptions
    WHERE enabled = TRUE
      AND qywx_user_id IS NOT NULL
      AND qywx_user_id <> ''
    ORDER BY updated_at DESC
    LIMIT 1
    `
  );
  const targetUserId = result.rows[0]?.qywx_user_id?.trim();
  if (!targetUserId) {
    throw new Error("未找到可用于联调的启用订阅用户，请通过 --touser 指定目标 userid");
  }
  return targetUserId;
};

const loadRecentArticles = async (count: number): Promise<ArticlePreview[]> => {
  const result = await query<ArticleRow>(
    `
    SELECT
      articles.id,
      articles.title,
      articles.summary,
      articles.author,
      articles.channel_code,
      channels.name AS channel_name,
      articles.category,
      articles.published_at,
      articles.updated_at
    FROM articles
    LEFT JOIN article_channels channels ON channels.code = articles.channel_code
    WHERE articles.status = 'published'
    ORDER BY articles.published_at DESC NULLS LAST, articles.updated_at DESC
    LIMIT $1
    `,
    [count]
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title.trim(),
    summary: row.summary.trim(),
    author: row.author.trim() || "AI订阅助手",
    channelLabel:
      row.channel_name?.trim() || row.category.trim() || row.channel_code?.trim() || "栏目资讯",
    url: buildArticleUrl(row.id),
  }));
};

const buildDigestSummary = (articles: ArticlePreview[]): string =>
  articles
    .map((article, index) => `${index + 1}. ${trimToLength(article.title, 42)}`)
    .join("；");

const getRandomDigestImageUrl = async (): Promise<string> => {
  const imageDirectory = "/opt/idapps/ai_web/apps/web/public/images";
  const fileNames = await readdir(imageDirectory);
  const candidates = fileNames.filter((fileName) =>
    /\.(png|jpe?g|webp|gif)$/i.test(fileName)
  );
  if (candidates.length === 0) {
    throw new Error(`聚合卡片图片目录为空: ${imageDirectory}`);
  }
  const selectedFile =
    candidates[Math.floor(Math.random() * candidates.length)] ??
    path.basename(candidates[0]);
  return buildPublicImageUrl(selectedFile);
};

const createDigestPushRecord = async (
  input: DigestRecordInput
): Promise<{ recordId: string }> => {
  const record = await pushRecordStore.create({
    articleId: input.articles[0]?.id,
    channelCode: "digest-today",
    qywxUserId: input.touser,
    deliveryMode: "user",
    messageType: input.messageType,
    title: input.title,
    summary: input.summary,
    url: input.url,
    requestPayload: {
      articleIds: input.articles.map((article) => article.id),
      articleTitles: input.articles.map((article) => article.title),
      ...input.requestPayload,
    },
  });
  return { recordId: record.id };
};

const buildNewsNoticeCard = async (articles: ArticlePreview[]): Promise<BuiltTemplateCard> => {
  const digestUrl = buildTodayDigestUrl();
  const title = `【联调】news_notice 单卡片 ${articles.length} 条资讯`;
  const summary = trimToLength(buildDigestSummary(articles), 44);
  const imageUrl = await getRandomDigestImageUrl();
  return {
    title,
    summary,
    url: digestUrl,
    templateCard: {
      card_type: "news_notice",
      source: {
        desc: "AI在徐医",
        desc_color: 0,
      },
      main_title: {
        title,
        desc: summary,
      },
      card_image: {
        url: imageUrl,
        aspect_ratio: 1.77,
      },
      vertical_content_list: articles.slice(0, 4).map((article) => ({
        title: trimToLength(article.title, 38),
        desc: trimToLength(article.summary || article.channelLabel, 160),
      })),
      jump_list: [
        {
          type: 1,
          title: "点击查看详情",
          url: digestUrl,
        },
      ],
      card_action: {
        type: 1,
        url: digestUrl,
      },
      task_id: `news-notice-${Date.now()}`,
    },
  };
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const requestedCount = toPositiveInt(getArg(args, "count"), 3);
  const articleCount = Math.max(2, Math.min(requestedCount, 4));
  await initDb();
  const targetUserId = await resolveTargetUserId(getArg(args, "touser"));
  const articles = await loadRecentArticles(articleCount);
  if (articles.length < 2) {
    throw new Error("已发布文章少于 2 条，无法执行多条资讯单卡片测试");
  }
  logger.info("wecom.template_cards.test.start", {
    touser: targetUserId,
    articleCount: articles.length,
    articleIds: articles.map((article) => article.id),
  });
  const newsCard = await buildNewsNoticeCard(articles);
  const newsRecord = await createDigestPushRecord({
    touser: targetUserId,
    articles,
    messageType: "template_card.news_notice",
    title: newsCard.title,
    summary: newsCard.summary,
    url: newsCard.url,
    requestPayload: { cardType: "news_notice" },
  });
  const newsResult = await wecomClient.sendTemplateCard({
    touser: targetUserId,
    templateCard: newsCard.templateCard,
  });
  await pushRecordStore.markSuccess(newsRecord.recordId, {
    retryCount: newsResult.attempt - 1,
    wecomErrcode: newsResult.result.errcode,
    wecomErrmsg: newsResult.result.errmsg,
    wecomMsgid: newsResult.result.msgid,
    responseCode: newsResult.result.response_code,
    responsePayload: {
      request: newsResult.payload,
      response: newsResult.result,
      invalidUserIds: newsResult.invalidUserIds,
    },
  });
  logger.info("wecom.template_cards.test.news_notice.success", {
    touser: targetUserId,
    msgid: newsResult.result.msgid,
    responseCode: newsResult.result.response_code,
    invalidUserIds: newsResult.invalidUserIds,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        touser: targetUserId,
        articleCount: articles.length,
        articleTitles: articles.map((article) => article.title),
        newsNotice: {
          errcode: newsResult.result.errcode,
          errmsg: newsResult.result.errmsg,
          msgid: newsResult.result.msgid ?? null,
          responseCode: newsResult.result.response_code ?? null,
          invalidUserIds: newsResult.invalidUserIds,
          digestUrl: newsCard.url,
        },
      },
      null,
      2
    )}\n`
  );
};

run()
  .catch((error: Error) => {
    logger.error("wecom.template_cards.test.failed", { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
