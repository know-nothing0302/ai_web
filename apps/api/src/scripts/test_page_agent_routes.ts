import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { env } from "../config/env";
import { app } from "../app";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/page-agent`;

    const createResponse = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(createResponse.status, 200);
    const conversation = await createResponse.json();
    assert.equal(typeof conversation.id, "string");

    const qaResponse = await fetch(`${baseUrl}/qa`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conversationId: conversation.id,
        question: "这篇文章讲什么？",
        pageType: "article_detail",
        route: "/articles/mock-id",
        pageTitle: "文章详情",
        selectionText: "",
        context: {
          articleId: "mock-id",
          title: "医学 AI 研究进展",
          summary: "文章讨论了医学 AI 在教学与科研中的应用。",
          contentPreview: "医学 AI 正在用于辅助教学、科研分析和知识服务。",
        },
      }),
    });
    assert.equal(qaResponse.status, 200);
    const qaResult = await qaResponse.json();
    assert.equal(qaResult.conversationId, conversation.id);

    const listResponse = await fetch(`${baseUrl}/conversations`);
    assert.equal(listResponse.status, 200);
    const listResult = await listResponse.json();
    assert.equal(Array.isArray(listResult.items), true);

    const messagesResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/messages`);
    assert.equal(messagesResponse.status, 200);
    const messages = await messagesResponse.json();
    assert.equal(Array.isArray(messages.items), true);

    const assistantMessage = messages.items.find((item: { role: string }) => item.role === "assistant");
    assert.equal(typeof assistantMessage?.id, "string");

    const feedbackResponse = await fetch(`${baseUrl}/messages/${assistantMessage.id}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        score: 1,
        tag: "回答清晰",
        content: "希望以后多给步骤",
      }),
    });
    assert.equal(feedbackResponse.status, 200);
  } finally {
    server.close();
  }
};

void run();
