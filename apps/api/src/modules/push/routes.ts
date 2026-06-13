import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { pushRecordStore } from "../../lib/store";
import { requireAdmin, requireAdminOrInternalToken } from "../../middleware/auth";
import { pushService } from "./service";
import { tagSyncService } from "./tag_sync_service";

const instantSchema = z.object({
  channelCode: z.string().trim().min(1),
});

const digestTriggerSchema = z.object({
  referenceAt: z.string().datetime({ offset: true }).optional(),
});

const verifySchema = z.object({
  channelCode: z.string().trim().min(1),
  frequency: z.enum(["daily", "instant"]).default("daily"),
  subscriptionUserId: z.string().trim().min(1).optional(),
});

const recordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const tagFrequencySchema = z.enum(["daily", "weekly", "instant"]);

const tagMappingsQuerySchema = z.object({
  channelCode: z.string().trim().min(1).optional(),
  frequency: tagFrequencySchema.optional(),
  enabledOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const tagStateQuerySchema = z.object({
  channelCode: z.string().trim().min(1),
  frequency: tagFrequencySchema,
});

const tagEnsureSchema = z.object({
  channelCode: z.string().trim().min(1),
  frequency: tagFrequencySchema,
});

const tagSyncSchema = z
  .object({
    syncAll: z.boolean().default(false),
    channelCode: z.string().trim().min(1).optional(),
    frequency: tagFrequencySchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.syncAll && (!value.channelCode || !value.frequency)) {
      context.addIssue({
        code: "custom",
        message: "syncAll=false 时必须同时提供 channelCode 和 frequency",
      });
    }
  });

const broadcastSchema = z.object({
  articleId: z.string().trim().min(1),
  title: z.string().trim().optional(),
  summary: z.string().trim().optional(),
});

const targetedSchema = z.object({
  articleId: z.string().trim().min(1),
  targetGroup: z.enum(["teachers", "students"]),
  title: z.string().trim().optional(),
  summary: z.string().trim().optional(),
});

export const pushRouter = Router();

const parseReferenceAt = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }
  return new Date(value);
};

pushRouter.post("/instant", requireAdmin, async (request, response) => {
  const parsed = instantSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const count = await pushService.pushInstantByChannelCode(parsed.data.channelCode);
  response.json({ pushedCount: count });
});

pushRouter.post("/broadcast", requireAdmin, async (request, response) => {
  const parsed = broadcastSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const result = await pushService.broadcastArticle(parsed.data);
  response.json(result);
});

pushRouter.post("/targeted", requireAdmin, async (request, response) => {
  const parsed = targetedSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const result = await pushService.pushTargetedArticle(parsed.data);
  response.json(result);
});

pushRouter.post("/daily", requireAdminOrInternalToken, async (request, response) => {
  const parsed = digestTriggerSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const count = await pushService.pushDailyDigest(parseReferenceAt(parsed.data.referenceAt));
  response.json({
    frequency: "daily",
    referenceAt: parsed.data.referenceAt ?? null,
    pushedCount: count,
  });
});

pushRouter.post("/weekly", requireAdminOrInternalToken, async (request, response) => {
  const parsed = digestTriggerSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const count = await pushService.pushWeeklyDigest(parseReferenceAt(parsed.data.referenceAt));
  response.json({
    frequency: "weekly",
    referenceAt: parsed.data.referenceAt ?? null,
    pushedCount: count,
  });
});

pushRouter.post(
  "/instant/deferred",
  requireAdminOrInternalToken,
  async (request, response) => {
    const parsed = digestTriggerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    const count = await pushService.pushDeferredInstantDigest(
      parseReferenceAt(parsed.data.referenceAt)
    );
    response.json({
      frequency: "instant",
      mode: "deferred_digest",
      referenceAt: parsed.data.referenceAt ?? null,
      pushedCount: count,
    });
  }
);

pushRouter.post("/verify", requireAdminOrInternalToken, async (request, response) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const summary = await pushService.verifyLatestByChannelCode(parsed.data);
  response.json(summary);
});

pushRouter.get("/schedule", (_request, response) => {
  response.json({
    timezone: env.pushTimezone,
    batches: [
      { label: "午间推送", cron: env.dailyPushCron2, description: "每日第二批，推送前一日晚间至当日午间发布的内容" },
      { label: "晚间推送", cron: env.dailyPushCron, description: "每日主要批次，推送当日午间至当日晚间发布的内容" },
      { label: "每周速览", cron: env.weeklyPushCron, description: "每周日汇总本周精华" },
    ],
  });
});

pushRouter.get("/records", requireAdminOrInternalToken, async (request, response) => {
  const parsed = recordsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const items = await pushRecordStore.listRecent(parsed.data.limit);
  response.json({ items });
});

pushRouter.get(
  "/tags/mappings",
  requireAdminOrInternalToken,
  async (request, response) => {
    const parsed = tagMappingsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    const items = await tagSyncService.listMappings(parsed.data);
    response.json({ items, total: items.length });
  }
);

pushRouter.get("/tags/state", requireAdminOrInternalToken, async (request, response) => {
  const parsed = tagStateQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const state = await tagSyncService.getChannelFrequencyTagState(parsed.data);
  response.json(state);
});

pushRouter.post(
  "/tags/ensure",
  requireAdminOrInternalToken,
  async (request, response) => {
    const parsed = tagEnsureSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }
    const mapping = await tagSyncService.ensureTagMapping(parsed.data);
    response.json(mapping);
  }
);

pushRouter.post("/tags/sync", requireAdminOrInternalToken, async (request, response) => {
  const parsed = tagSyncSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  if (parsed.data.syncAll) {
    const items = await tagSyncService.syncAllChannelTags();
    response.json({ mode: "all", items, total: items.length });
    return;
  }
  const summary = await tagSyncService.syncChannelFrequencyTag({
    channelCode: parsed.data.channelCode!,
    frequency: parsed.data.frequency!,
  });
  response.json({ mode: "single", item: summary });
});
