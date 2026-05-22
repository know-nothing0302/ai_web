"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelRouter = void 0;
const express_1 = require("express");
const store_1 = require("../../lib/store");
const auth_1 = require("../../middleware/auth");
exports.channelRouter = (0, express_1.Router)();
exports.channelRouter.get("/", auth_1.requireAuth, async (request, response) => {
    const includeDisabled = request.query.includeDisabled?.toString() === "true";
    const items = await store_1.articleChannelStore.list(!includeDisabled);
    response.json({ items });
});
