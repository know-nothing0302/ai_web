"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const store_1 = require("../../lib/store");
const auth_1 = require("../../middleware/auth");
const service_1 = require("./service");
const tag_sync_service_1 = require("./tag_sync_service");
const instantSchema = zod_1.z.object({
    channelCode: zod_1.z.string().trim().min(1),
});
const digestTriggerSchema = zod_1.z.object({
    referenceAt: zod_1.z.string().datetime({ offset: true }).optional(),
});
const verifySchema = zod_1.z.object({
    channelCode: zod_1.z.string().trim().min(1),
    frequency: zod_1.z.enum(["daily", "instant"]).default("daily"),
    subscriptionUserId: zod_1.z.string().trim().min(1).optional(),
});
const recordsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
const tagFrequencySchema = zod_1.z.enum(["daily", "weekly", "instant"]);
const tagMappingsQuerySchema = zod_1.z.object({
    channelCode: zod_1.z.string().trim().min(1).optional(),
    frequency: tagFrequencySchema.optional(),
    enabledOnly: zod_1.z
        .union([zod_1.z.literal("true"), zod_1.z.literal("false"), zod_1.z.boolean()])
        .optional()
        .transform((value) => value === true || value === "true"),
});
const tagStateQuerySchema = zod_1.z.object({
    channelCode: zod_1.z.string().trim().min(1),
    frequency: tagFrequencySchema,
});
const tagEnsureSchema = zod_1.z.object({
    channelCode: zod_1.z.string().trim().min(1),
    frequency: tagFrequencySchema,
});
const tagSyncSchema = zod_1.z
    .object({
    syncAll: zod_1.z.boolean().default(false),
    channelCode: zod_1.z.string().trim().min(1).optional(),
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
exports.pushRouter = (0, express_1.Router)();
const parseReferenceAt = (value) => {
    if (!value) {
        return undefined;
    }
    return new Date(value);
};
exports.pushRouter.post("/instant", auth_1.requireAdmin, async (request, response) => {
    const parsed = instantSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const count = await service_1.pushService.pushInstantByChannelCode(parsed.data.channelCode);
    response.json({ pushedCount: count });
});
exports.pushRouter.post("/daily", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = digestTriggerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const count = await service_1.pushService.pushDailyDigest(parseReferenceAt(parsed.data.referenceAt));
    response.json({
        frequency: "daily",
        referenceAt: parsed.data.referenceAt ?? null,
        pushedCount: count,
    });
});
exports.pushRouter.post("/weekly", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = digestTriggerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const count = await service_1.pushService.pushWeeklyDigest(parseReferenceAt(parsed.data.referenceAt));
    response.json({
        frequency: "weekly",
        referenceAt: parsed.data.referenceAt ?? null,
        pushedCount: count,
    });
});
exports.pushRouter.post("/instant/deferred", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = digestTriggerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const count = await service_1.pushService.pushDeferredInstantDigest(parseReferenceAt(parsed.data.referenceAt));
    response.json({
        frequency: "instant",
        mode: "deferred_digest",
        referenceAt: parsed.data.referenceAt ?? null,
        pushedCount: count,
    });
});
exports.pushRouter.post("/verify", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const summary = await service_1.pushService.verifyLatestByChannelCode(parsed.data);
    response.json(summary);
});
exports.pushRouter.get("/records", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = recordsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const items = await store_1.pushRecordStore.listRecent(parsed.data.limit);
    response.json({ items });
});
exports.pushRouter.get("/tags/mappings", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = tagMappingsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const items = await tag_sync_service_1.tagSyncService.listMappings(parsed.data);
    response.json({ items, total: items.length });
});
exports.pushRouter.get("/tags/state", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = tagStateQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const state = await tag_sync_service_1.tagSyncService.getChannelFrequencyTagState(parsed.data);
    response.json(state);
});
exports.pushRouter.post("/tags/ensure", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = tagEnsureSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const mapping = await tag_sync_service_1.tagSyncService.ensureTagMapping(parsed.data);
    response.json(mapping);
});
exports.pushRouter.post("/tags/sync", auth_1.requireAdminOrInternalToken, async (request, response) => {
    const parsed = tagSyncSchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    if (parsed.data.syncAll) {
        const items = await tag_sync_service_1.tagSyncService.syncAllChannelTags();
        response.json({ mode: "all", items, total: items.length });
        return;
    }
    const summary = await tag_sync_service_1.tagSyncService.syncChannelFrequencyTag({
        channelCode: parsed.data.channelCode,
        frequency: parsed.data.frequency,
    });
    response.json({ mode: "single", item: summary });
});
