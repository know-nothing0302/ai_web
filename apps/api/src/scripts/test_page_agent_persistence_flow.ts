import assert from "node:assert/strict";

import { initDb } from "../lib/db";
import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  userProfileStore,
} from "../lib/store";

const run = async (): Promise<void> => {
  await initDb();
  const userId = `plan-store-${Date.now()}`;
  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });
  assert.equal(conversation.userId, userId);

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "user",
    messageType: "question",
    content: "第一问",
    sanitizedContent: "第一问",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
  });

  const history = await pageAgentMessageStore.listRecentByConversation(conversation.id, 10);
  assert.equal(history.length, 1);

  const profile = await userProfileStore.upsertByUser(userId, {
    profileVersion: 1,
    preferenceSummary: "偏好结构化回答",
    personaPrompt: "回答时先给结论，再给步骤。",
    interestTopics: ["医学AI"],
    responsePreferences: {
      style: "structured",
    },
    evidenceStats: {
      questionCount: 1,
    },
  });
  assert.equal(profile.userId, userId);
};

void run();
