import axios from "axios";
import { Router } from "express";
import { env } from "../config/env";
import { wecomConfigStore } from "../lib/store";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json({
    ok: true,
    service: "ai_web_api",
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/integrations", async (_request, response) => {
  const checks = await Promise.allSettled([
    env.casValidateUrl
      ? axios.get(env.casValidateUrl, { timeout: 2000 }).then(() => "ok")
      : Promise.resolve("skip"),
    wecomConfigStore
      .getEnabledConfig(env.wecomAppCode)
      .then((config) =>
        config || (env.wecomCorpId && env.wecomAgentId && env.wecomSecret)
          ? "configured"
          : "skip"
      ),
    env.aiXyApiUrl
      ? axios.get(`${env.aiXyApiUrl}/health`, { timeout: 2000 }).then(() => "ok")
      : Promise.resolve("skip"),
  ]);
  const status = checks.map((item) =>
    item.status === "fulfilled" ? item.value : "down"
  );
  response.json({
    cas: status[0],
    wecom: status[1],
    ai_xy: status[2],
  });
});
