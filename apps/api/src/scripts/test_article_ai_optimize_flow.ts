import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import axios from "axios";

import { env } from "../config/env";
import { app } from "../app";
import { closeDb, initDb } from "../lib/db";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;

  const originalPost = axios.post;
  axios.post = (async (url, body, config) => {
    if (String(url).includes("/v1/chat/completions")) {
      return {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestedTitle: "医学 AI 诊断应用观察",
                  suggestedSummary:
                    "文章概括了医学 AI 在诊断场景中的进展、价值与落地重点。",
                  suggestedChannelCode: "medical-frontier",
                  optimizedContent:
                    "## 应用进展\n**医学 AI** 正在推动诊断效率提升。\n### 关键抓手\n- 数据治理\n- 临床校验\n## 实践重点\n需要同步关注数据治理与落地规范。",
                  notes: "已补齐小标题并优化段落结构",
                }),
              },
            },
          ],
        },
      } as Awaited<ReturnType<typeof axios.post>>;
    }
    return originalPost(url, body, config);
  }) as typeof axios.post;

  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/articles/ai-optimize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "手工整理稿",
          content:
            "医学 AI 正在用于影像识别、风险预测和诊断支持，但原稿结构比较松散。",
          summary: "",
          channelCode: "",
          originalUrl: "https://example.com/manual",
        }),
      }
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.suggestedChannelCode, "medical-frontier");
    assert.match(result.optimizedContent, /## 应用进展/);
    assert.match(result.optimizedContent, /## 应用进展\n\n\*\*医学 AI\*\*/);
    assert.match(result.optimizedContent, /### 关键抓手\n\n- 数据治理/);
  } finally {
    axios.post = originalPost;
    server.close();
    await closeDb();
  }
};

void run();
