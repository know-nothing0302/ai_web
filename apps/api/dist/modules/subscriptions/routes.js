"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const logger_1 = require("../../lib/logger");
const store_1 = require("../../lib/store");
const auth_1 = require("../../middleware/auth");
const upsertSchema = zod_1.z.object({
    channelCodes: zod_1.z.array(zod_1.z.string().trim().min(1)).min(1),
    frequency: zod_1.z.enum(["daily", "weekly", "instant"]),
    enabled: zod_1.z.boolean(),
});
exports.subscriptionRouter = (0, express_1.Router)();
exports.subscriptionRouter.get("/me", auth_1.requireAuth, async (request, response) => {
    const userId = request.session.user?.id;
    if (!userId) {
        response.status(401).json({ message: "未登录" });
        return;
    }
    const items = await store_1.subscriptionStore.listByUser(userId);
    response.json({ items });
});
exports.subscriptionRouter.put("/me", auth_1.requireAuth, async (request, response) => {
    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const enabledChannels = await store_1.articleChannelStore.list(true);
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
    logger_1.logger.info("subscription.upsert", {
        userId: sessionUser.id,
        channelCount: parsed.data.channelCodes.length,
        frequency: parsed.data.frequency,
        enabled: parsed.data.enabled,
    });
    const item = await store_1.subscriptionStore.upsertByUser(sessionUser.id, {
        ...parsed.data,
        qywxUserId: sessionUser.id,
        qywxUserName: sessionUser.displayName,
        categories: parsed.data.channelCodes.map((item) => channelNameMap.get(item) ?? item),
    });
    await (0, store_1.recordAnalyticsEventSafely)({
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
