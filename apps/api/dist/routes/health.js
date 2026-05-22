"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const axios_1 = __importDefault(require("axios"));
const express_1 = require("express");
const env_1 = require("../config/env");
const store_1 = require("../lib/store");
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get("/", (_request, response) => {
    response.json({
        ok: true,
        service: "ai_web_api",
        timestamp: new Date().toISOString(),
    });
});
exports.healthRouter.get("/integrations", async (_request, response) => {
    const checks = await Promise.allSettled([
        env_1.env.casValidateUrl
            ? axios_1.default.get(env_1.env.casValidateUrl, { timeout: 2000 }).then(() => "ok")
            : Promise.resolve("skip"),
        store_1.wecomConfigStore
            .getEnabledConfig(env_1.env.wecomAppCode)
            .then((config) => config || (env_1.env.wecomCorpId && env_1.env.wecomAgentId && env_1.env.wecomSecret)
            ? "configured"
            : "skip"),
        env_1.env.aiXyApiUrl
            ? axios_1.default.get(`${env_1.env.aiXyApiUrl}/health`, { timeout: 2000 }).then(() => "ok")
            : Promise.resolve("skip"),
    ]);
    const status = checks.map((item) => item.status === "fulfilled" ? item.value : "down");
    response.json({
        cas: status[0],
        wecom: status[1],
        ai_xy: status[2],
    });
});
