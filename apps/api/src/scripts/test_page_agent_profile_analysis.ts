import assert from "node:assert/strict";

import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  subscriptionStore,
  userProfileStore,
} from "../lib/store.js";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service.js";

const run = async (): Promise<void> => {
  const userId = `plan-profile-${Date.now()}`;

  await subscriptionStore.upsertByUser(userId, {
    channelCodes: ["medical-frontier", "policy-ethics"],
    categories: ["医学AI前沿", "AI政策与伦理"],
    frequency: "daily",
    qywxUserId: userId,
    qywxUserName: "plan-user",
    enabled: true,
  });

  const conversation = await pageAgentConversationStore.create({
    userId,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "user",
    messageType: "question",
    content: "请结合政策背景解释这篇文章。",
    sanitizedContent: "请结合政策背景解释这篇文章。",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
  });

  await pageAgentMessageStore.create({
    conversationId: conversation.id,
    userId,
    role: "feedback",
    messageType: "feedback",
    content: "希望多给步骤和示例。",
    sanitizedContent: "希望多给步骤和示例。",
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
    contextPayload: {},
    sourcesPayload: [],
    feedbackScore: 1,
    feedbackTag: "更具体",
  });

  const job = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: userId,
  });
  assert.equal(job.status, "success");

  const profile = await userProfileStore.getByUserId(userId);
  assert.equal(typeof profile?.personaPrompt, "string");
  assert.equal((profile?.personaPrompt.length ?? 0) <= 500, true);
};

void run();
