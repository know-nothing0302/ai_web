import { Router } from "express";
import { articleChannelStore } from "../../lib/store";
import { requireAuth } from "../../middleware/auth";

export const channelRouter = Router();

channelRouter.get("/", requireAuth, async (request, response) => {
  const includeDisabled = request.query.includeDisabled?.toString() === "true";
  const items = await articleChannelStore.list(!includeDisabled);
  response.json({ items });
});
