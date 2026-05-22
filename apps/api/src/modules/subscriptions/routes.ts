import { Router } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger";
import {
  articleChannelStore,
  recordAnalyticsEventSafely,
  subscriptionStore,
} from "../../lib/store";
import { requireAuth } from "../../middleware/auth";

const upsertSchema = z.object({
  channelCodes: z.array(z.string().trim().min(1)).min(1),
  frequency: z.enum(["daily", "weekly", "instant"]),
  enabled: z.boolean(),
});

export const subscriptionRouter = Router();

subscriptionRouter.get("/me", requireAuth, async (request, response) => {
  const userId = request.session.user?.id;
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const items = await subscriptionStore.listByUser(userId);
  response.json({ items });
});

subscriptionRouter.put("/me", requireAuth, async (request, response) => {
  const parsed = upsertSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const enabledChannels = await articleChannelStore.list(true);
  const enabledCodeSet = new Set(enabledChannels.map((item) => item.code));
  const invalidCodes = parsed.data.channelCodes.filter((item) => !enabledCodeSet.has(item));
  if (invalidCodes.length > 0) {
    response.status(400).json({ message: "存在非法栏目标识", invalidCodes });
    return;
  }
  const channelNameMap = new Map(enabledChannels.map((item) => [item.code, item.name]));
  const sessionUser = request.session.user;
  if (!sessionUser) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  logger.info("subscription.upsert", {
    userId: sessionUser.id,
    channelCount: parsed.data.channelCodes.length,
    frequency: parsed.data.frequency,
    enabled: parsed.data.enabled,
  });
  const item = await subscriptionStore.upsertByUser(sessionUser.id, {
    ...parsed.data,
    qywxUserId: sessionUser.id,
    qywxUserName: sessionUser.displayName,
    categories: parsed.data.channelCodes.map((item) => channelNameMap.get(item) ?? item),
  });
  await recordAnalyticsEventSafely({
    eventType: "subscription",
    eventName: "subscription_updated",
    userId: sessionUser.id,
    sourceModule: "subscriptions.routes",
    eventPayload: {
      frequency: parsed.data.frequency,
      enabled: parsed.data.enabled,
      channelCodes: parsed.data.channelCodes,
    },
  });
  response.json(item);
});
