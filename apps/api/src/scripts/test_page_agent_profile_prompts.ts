import assert from "node:assert/strict";

import {
  buildUserProfileAnalysisSystemPrompt,
  buildUserProfileAnalysisUserPrompt,
  personaPromptFallbackByUserType,
  preferenceSummaryFallbackByUserType,
} from "../modules/page_agent/profile_prompts.js";

const run = (): void => {
  // ── 1: system prompt 必须接受 userType 参数并包含分层指令 ──
  const teacherSystem = buildUserProfileAnalysisSystemPrompt("teacher");
  assert.ok(
    teacherSystem.includes("教师") || teacherSystem.includes("teacher"),
    "system prompt 应包含教师分层指令"
  );
  assert.ok(
    teacherSystem.includes("专业") || teacherSystem.includes("学术") || teacherSystem.includes("系统"),
    "教师分层应指导专业/学术/系统性回答"
  );

  const undergraduateSystem = buildUserProfileAnalysisSystemPrompt("undergraduate");
  assert.ok(
    undergraduateSystem.includes("本科") || undergraduateSystem.includes("undergraduate"),
    "system prompt 应包含本科生分层指令"
  );
  assert.ok(
    undergraduateSystem.includes("直白") || undergraduateSystem.includes("易懂") || undergraduateSystem.includes("类比"),
    "本科生分层应指导直白/易懂/类比化回答"
  );

  const graduateSystem = buildUserProfileAnalysisSystemPrompt("graduate");
  assert.ok(
    graduateSystem.includes("研究") || graduateSystem.includes("graduate"),
    "system prompt 应包含研究生分层指令"
  );
  assert.ok(
    graduateSystem.includes("启发") || graduateSystem.includes("批判") || graduateSystem.includes("深入"),
    "研究生分层应指导启发/批判/深入方向"
  );

  const unknownSystem = buildUserProfileAnalysisSystemPrompt("unknown");
  assert.ok(
    unknownSystem.includes("未知") || unknownSystem.includes("保持中性") || unknownSystem.includes("neutral"),
    "未知类型应保持中性"
  );

  // ── 2: user prompt 必须接受 userType 和 professionalContext ──
  const userPrompt = buildUserProfileAnalysisUserPrompt({
    subscriptions: {
      channelCodes: ["medical-frontier"],
      frequencies: ["daily"],
    },
    questionStats: {
      total: 10,
      followUpCount: 3,
      pageTypeDistribution: { article_detail: 8, article_list: 2 },
    },
    recentQuestions: ["这篇文章的核心观点是什么？"],
    recentFeedback: [{ score: 1, tag: "更具体", content: "多给一些步骤" }],
    userType: "teacher",
    professionalContext: {
      college: "医学影像学院",
      major: "医学影像学",
      grade: undefined,
    },
  });

  const parsed = JSON.parse(userPrompt);
  assert.equal(parsed.userType, "teacher", "user prompt 应包含 userType");
  assert.equal(
    parsed.professionalContext.college,
    "医学影像学院",
    "user prompt 应包含 professionalContext.college"
  );
  assert.equal(
    parsed.professionalContext.major,
    "医学影像学",
    "user prompt 应包含 professionalContext.major"
  );

  // ── 3: system prompt 必须要求 non-empty personaPrompt 和 preferenceSummary ──
  assert.ok(
    teacherSystem.includes("非空字符串") || teacherSystem.includes("不得输出空字符串"),
    "system prompt 应要求 personaPrompt/preferenceSummary 非空"
  );
  assert.ok(
    teacherSystem.includes("style 字段") || teacherSystem.includes("不得输出空对象"),
    "system prompt 应要求 responsePreferences 至少包含 style"
  );

  // ── 4: system prompt 必须要求指令格式（禁止描述型 personaPrompt）──
  assert.ok(
    teacherSystem.includes("指令格式") || teacherSystem.includes("回答时"),
    "system prompt 应要求 personaPrompt 为指令格式 —— 以'回答时'开头"
  );
  assert.ok(
    teacherSystem.includes("禁止") &&
      (teacherSystem.includes("您是") || teacherSystem.includes("该用户") || teacherSystem.includes("描述性")),
    "system prompt 应禁止使用'您是…'、'该用户…'等描述性措辞"
  );

  // ── 5: fallback 常量覆盖全部 4 种类型、非空、且为指令格式 ──
  const userTypes: Array<"teacher" | "undergraduate" | "graduate" | "unknown"> = [
    "teacher",
    "undergraduate",
    "graduate",
    "unknown",
  ];
  for (const ut of userTypes) {
    const pp = personaPromptFallbackByUserType[ut];
    const ps = preferenceSummaryFallbackByUserType[ut];
    assert.ok(typeof pp === "string" && pp.trim().length > 0, `${ut} personaPrompt fallback 非空`);
    assert.ok(pp.length <= 500, `${ut} personaPrompt fallback ≤500 字`);
    assert.ok(pp.startsWith("回答时"), `${ut} personaPrompt fallback 必须以"回答时"开头`);
    assert.ok(typeof ps === "string" && ps.trim().length > 0, `${ut} preferenceSummary fallback 非空`);
  }

  console.log("[AIWEB] test_page_agent_profile_prompts PASS");
};

void run();
