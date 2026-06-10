import assert from "node:assert/strict";

import {
  pageAgentConversationStore,
  pageAgentMessageStore,
  subscriptionStore,
  userProfileStore,
} from "../lib/store.js";
import { query } from "../lib/db.js";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service.js";

const run = async (): Promise<void> => {
  // ── Case 1: 未知类型用户（ID 不以 1/2/3 开头，无 users 表记录）──
  const unknownUser = `plan-profile-${Date.now()}`;

  await subscriptionStore.upsertByUser(unknownUser, {
    channelCodes: ["medical-frontier", "policy-ethics"],
    categories: ["医学AI前沿", "AI政策与伦理"],
    frequency: "daily",
    qywxUserId: unknownUser,
    qywxUserName: "plan-user",
    enabled: true,
  });

  const conv1 = await pageAgentConversationStore.create({
    userId: unknownUser,
    pageType: "article_detail",
    route: "/articles/mock-id",
    pageTitle: "文章详情",
  });

  await pageAgentMessageStore.create({
    conversationId: conv1.id,
    userId: unknownUser,
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
    conversationId: conv1.id,
    userId: unknownUser,
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

  const job1 = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: unknownUser,
  });
  assert.equal(job1.status, "success", "未知类型用户分析应成功");

  const profile1 = await userProfileStore.getByUserId(unknownUser);
  assert.equal(typeof profile1?.personaPrompt, "string");
  assert.equal((profile1?.personaPrompt.length ?? 0) <= 500, true);

  // ── Case 2: 教师用户（1开头 ID + users 表有专业信息）──
  const teacherUser = `1plan-teach-${Date.now()}`.slice(0, 64);
  const teacherCollege = "医学影像学院";
  const teacherMajor = "医学影像学";

  // 在 users 表中插入专业背景
  await query(
    `INSERT INTO users (xh, user_type, xm, xymc, zymc)
     VALUES ($1, 'jzg', '测试教师', $2, $3)
     ON CONFLICT (xh) DO UPDATE SET xymc = $2, zymc = $3, synced_at = NOW()`,
    [teacherUser, teacherCollege, teacherMajor]
  );

  await subscriptionStore.upsertByUser(teacherUser, {
    channelCodes: ["medical-frontier"],
    categories: ["医学AI前沿"],
    frequency: "daily",
    qywxUserId: teacherUser,
    qywxUserName: "teacher-test",
    enabled: true,
  });

  const conv2 = await pageAgentConversationStore.create({
    userId: teacherUser,
    pageType: "article_detail",
    route: "/articles/mock-id-2",
    pageTitle: "医学影像AI进展",
  });

  await pageAgentMessageStore.create({
    conversationId: conv2.id,
    userId: teacherUser,
    role: "user",
    messageType: "question",
    content: "这篇文章中的AI技术在影像诊断中如何应用？",
    sanitizedContent: "这篇文章中的AI技术在影像诊断中如何应用？",
    pageType: "article_detail",
    route: "/articles/mock-id-2",
    pageTitle: "医学影像AI进展",
    contextPayload: {},
    sourcesPayload: [],
  });

  await pageAgentMessageStore.create({
    conversationId: conv2.id,
    userId: teacherUser,
    role: "feedback",
    messageType: "feedback",
    content: "希望展开技术原理层面的分析。",
    sanitizedContent: "希望展开技术原理层面的分析。",
    pageType: "article_detail",
    route: "/articles/mock-id-2",
    pageTitle: "医学影像AI进展",
    contextPayload: {},
    sourcesPayload: [],
    feedbackScore: 1,
    feedbackTag: "深度不够",
  });

  const job2 = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: teacherUser,
  });
  assert.equal(job2.status, "success", "教师用户分析应成功");

  const profile2 = await userProfileStore.getByUserId(teacherUser);
  assert.equal(typeof profile2?.personaPrompt, "string");
  assert.equal((profile2?.personaPrompt.length ?? 0) <= 500, true);

  // 验证 evidenceStats 包含 userType
  const evidence2 = profile2?.evidenceStats as Record<string, unknown> | undefined;
  assert.equal(
    evidence2?.userType,
    "teacher",
    "教师用户 evidenceStats 应标记 userType=teacher"
  );

  // ── Case 3: 本科生用户（2开头 ID）──
  const undergradUser = `2plan-undg-${Date.now()}`.slice(0, 64);

  await subscriptionStore.upsertByUser(undergradUser, {
    channelCodes: ["student-zone"],
    categories: ["学生专栏"],
    frequency: "weekly",
    qywxUserId: undergradUser,
    qywxUserName: "student-test",
    enabled: true,
  });

  const conv3 = await pageAgentConversationStore.create({
    userId: undergradUser,
    pageType: "article_detail",
    route: "/articles/mock-id-3",
    pageTitle: "学生竞赛信息",
  });

  await pageAgentMessageStore.create({
    conversationId: conv3.id,
    userId: undergradUser,
    role: "user",
    messageType: "question",
    content: "这个比赛我该怎么准备？",
    sanitizedContent: "这个比赛我该怎么准备？",
    pageType: "article_detail",
    route: "/articles/mock-id-3",
    pageTitle: "学生竞赛信息",
    contextPayload: {},
    sourcesPayload: [],
  });

  const job3 = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: undergradUser,
  });
  assert.equal(job3.status, "success", "本科生用户分析应成功");

  const profile3 = await userProfileStore.getByUserId(undergradUser);
  const evidence3 = profile3?.evidenceStats as Record<string, unknown> | undefined;
  assert.equal(
    evidence3?.userType,
    "undergraduate",
    "本科生 evidenceStats 应标记 userType=undergraduate"
  );

  // ── Case 4: 研究生用户（3开头 ID）──
  const gradUser = `3plan-grad-${Date.now()}`.slice(0, 64);

  const conv4 = await pageAgentConversationStore.create({
    userId: gradUser,
    pageType: "article_detail",
    route: "/articles/mock-id-4",
    pageTitle: "AI研究方法论",
  });

  await pageAgentMessageStore.create({
    conversationId: conv4.id,
    userId: gradUser,
    role: "user",
    messageType: "question",
    content: "这个研究方向还有哪些值得挖掘的子课题？",
    sanitizedContent: "这个研究方向还有哪些值得挖掘的子课题？",
    pageType: "article_detail",
    route: "/articles/mock-id-4",
    pageTitle: "AI研究方法论",
    contextPayload: {},
    sourcesPayload: [],
  });

  const job4 = await runUserProfileAnalysisJob({
    triggerMode: "manual",
    targetUserId: gradUser,
  });
  assert.equal(job4.status, "success", "研究生用户分析应成功");

  const profile4 = await userProfileStore.getByUserId(gradUser);
  const evidence4 = profile4?.evidenceStats as Record<string, unknown> | undefined;
  assert.equal(
    evidence4?.userType,
    "graduate",
    "研究生 evidenceStats 应标记 userType=graduate"
  );

  // 清理测试数据
  await query(`DELETE FROM users WHERE xh IN ($1, $2, $3)`, [
    teacherUser,
    undergradUser,
    gradUser,
  ]);

  console.log("[AIWEB] test_page_agent_profile_analysis PASS — 4/4 cases");
};

void run();
