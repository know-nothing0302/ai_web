"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const app_1 = require("../app");
const db_1 = require("../lib/db");
const run = async () => {
    env_1.env.devAuthBypass = true;
    const originalPost = axios_1.default.post;
    axios_1.default.post = (async (url, body, config) => {
        if (String(url).includes("/v1/chat/completions")) {
            return {
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    suggestedTitle: "医学 AI 诊断应用观察",
                                    suggestedSummary: "文章概括了医学 AI 在诊断场景中的进展、价值与落地重点。",
                                    suggestedChannelCode: "medical-frontier",
                                    optimizedContent: "## 应用进展\n**医学 AI** 正在推动诊断效率提升。\n### 关键抓手\n- 数据治理\n- 临床校验\n## 实践重点\n需要同步关注数据治理与落地规范。",
                                    notes: "已补齐小标题并优化段落结构",
                                }),
                            },
                        },
                    ],
                },
            };
        }
        return originalPost(url, body, config);
    });
    await (0, db_1.initDb)();
    const server = app_1.app.listen(0);
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/articles/ai-optimize`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                title: "手工整理稿",
                content: "医学 AI 正在用于影像识别、风险预测和诊断支持，但原稿结构比较松散。",
                summary: "",
                channelCode: "",
                originalUrl: "https://example.com/manual",
            }),
        });
        strict_1.default.equal(response.status, 200);
        const result = await response.json();
        strict_1.default.equal(result.suggestedChannelCode, "medical-frontier");
        strict_1.default.match(result.optimizedContent, /## 应用进展/);
        strict_1.default.match(result.optimizedContent, /## 应用进展\n\n\*\*医学 AI\*\*/);
        strict_1.default.match(result.optimizedContent, /### 关键抓手\n\n- 数据治理/);
    }
    finally {
        axios_1.default.post = originalPost;
        server.close();
        await (0, db_1.closeDb)();
    }
};
void run();
