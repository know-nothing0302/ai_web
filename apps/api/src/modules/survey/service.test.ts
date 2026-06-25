import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios at the top level — hoisted before any imports
vi.mock("axios");

import axios from "axios";
import {
  isQuestionVisible,
  getVisibleQuestions,
  validateResponse,
} from "./service";
import type { Survey, SurveyQuestion } from "../../lib/types";

// --- Test data helpers ---

const makeQuestion = (
  overrides: Partial<SurveyQuestion> & { id: string; type: SurveyQuestion["type"]; title: string }
): SurveyQuestion => ({
  required: false,
  ...overrides,
});

// ============================================================
// isQuestionVisible
// ============================================================
describe("isQuestionVisible", () => {
  it("returns true when question has no showIf", () => {
    const q = makeQuestion({ id: "q1", type: "text", title: "T" });
    expect(isQuestionVisible(q, {}, [q])).toBe(true);
  });

  it("returns false when dependency answer is missing", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["Yes", "No"], required: true }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "eq", value: "Yes" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, {}, questions)).toBe(false);
  });

  it("returns true on eq match", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["Yes", "No"] }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "eq", value: "Yes" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, { q1: "Yes" }, questions)).toBe(true);
  });

  it("neq: returns true when value differs", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["A", "B"] }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "neq", value: "A" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, { q1: "B" }, questions)).toBe(true);
  });

  it("neq: returns false when value equals", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["A", "B"] }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "neq", value: "A" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, { q1: "A" }, questions)).toBe(false);
  });

  it("includes: works with array answers", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "multiple_choice", title: "Q1", options: ["A", "B", "C"] }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "includes", value: "B" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, { q1: ["A", "B"] }, questions)).toBe(true);
  });

  it("includes: returns false when value not in array", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "multiple_choice", title: "Q1", options: ["A", "B"] }),
      makeQuestion({
        id: "q2", type: "text", title: "Q2",
        showIf: { questionId: "q1", op: "includes", value: "C" },
      }),
    ];
    expect(isQuestionVisible(questions[1]!, { q1: ["A", "B"] }, questions)).toBe(false);
  });

  it("chained showIf: q3 depends on q2 depends on q1", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["Yes", "No"] }),
      makeQuestion({
        id: "q2", type: "single_choice", title: "Q2", options: ["A", "B"],
        showIf: { questionId: "q1", op: "eq", value: "Yes" },
      }),
      makeQuestion({
        id: "q3", type: "text", title: "Q3",
        showIf: { questionId: "q2", op: "eq", value: "A" },
      }),
    ];
    expect(isQuestionVisible(questions[2]!, { q1: "Yes", q2: "A" }, questions)).toBe(true);
    expect(isQuestionVisible(questions[2]!, { q1: "No", q2: "A" }, questions)).toBe(false);
  });

  it("cycle detection: self-referencing showIf returns false", () => {
    const q = makeQuestion({
      id: "q1", type: "text", title: "Q1",
      showIf: { questionId: "q1", op: "eq", value: "X" },
    });
    expect(() => isQuestionVisible(q, { q1: "X" }, [q])).not.toThrow();
    expect(isQuestionVisible(q, { q1: "X" }, [q])).toBe(false);
  });

  it("cycle detection: cross-referencing questions", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "text", title: "Q1", showIf: { questionId: "q2", op: "eq", value: "X" } }),
      makeQuestion({ id: "q2", type: "text", title: "Q2", showIf: { questionId: "q1", op: "eq", value: "Y" } }),
    ];
    expect(() => isQuestionVisible(questions[0]!, { q1: "Y", q2: "X" }, questions)).not.toThrow();
    expect(isQuestionVisible(questions[0]!, { q1: "Y", q2: "X" }, questions)).toBe(false);
  });
});

// ============================================================
// getVisibleQuestions
// ============================================================
describe("getVisibleQuestions", () => {
  it("returns all questions when no showIf", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "text", title: "Q1" }),
      makeQuestion({ id: "q2", type: "text", title: "Q2" }),
    ];
    expect(getVisibleQuestions(questions, {})).toHaveLength(2);
  });

  it("filters hidden questions", () => {
    const questions = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["Yes", "No"] }),
      makeQuestion({ id: "q2", type: "text", title: "Q2", showIf: { questionId: "q1", op: "eq", value: "Yes" } }),
    ];
    const visible = getVisibleQuestions(questions, { q1: "No" });
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe("q1");
  });
});

// ============================================================
// validateResponse
// ============================================================
describe("validateResponse", () => {
  const questions: SurveyQuestion[] = [
    makeQuestion({ id: "q1", type: "single_choice", title: "必选", options: ["A", "B"], required: true }),
    makeQuestion({ id: "q2", type: "text", title: "选填", required: false }),
    makeQuestion({ id: "q3", type: "rating", title: "评分", required: true }),
    makeQuestion({ id: "q4", type: "text", title: "条件题", showIf: { questionId: "q1", op: "eq", value: "B" }, required: true }),
  ];

  it("valid response passes", () => {
    const result = validateResponse(questions, { q1: "A", q3: 4 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing required field fails", () => {
    const result = validateResponse(questions, { q1: "A" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("必答题"))).toBe(true);
  });

  it("invalid single_choice option fails", () => {
    const result = validateResponse(questions, { q1: "InvalidOption", q3: 4 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("无效"))).toBe(true);
  });

  it("rating out of range fails", () => {
    const result = validateResponse(questions, { q1: "A", q3: 6 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("1-5"))).toBe(true);
  });

  it("hidden required question is not enforced", () => {
    const result = validateResponse(questions, { q1: "A", q3: 4 });
    expect(result.valid).toBe(true);
  });

  it("hidden question with answer is rejected", () => {
    const result = validateResponse(questions, { q1: "A", q3: 4, q4: "不应该有" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("不可见"))).toBe(true);
  });

  it("multiple_choice validates options", () => {
    const mcQuestions: SurveyQuestion[] = [
      makeQuestion({ id: "q1", type: "multiple_choice", title: "多选", options: ["X", "Y"], required: true }),
    ];
    expect(validateResponse(mcQuestions, { q1: ["X", "Y"] }).valid).toBe(true);
    expect(validateResponse(mcQuestions, { q1: ["X", "Z"] }).valid).toBe(false);
  });
});

// ============================================================
// computeStats (mock the DB store)
// ============================================================
describe("computeStats", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("computes single_choice distribution", async () => {
    vi.doMock("../../lib/store", () => ({
      surveyResponseStore: {
        listBySurvey: () => Promise.resolve([
          { id: "r1", surveyId: "s1", answers: { q1: "A" }, createdAt: "" },
          { id: "r2", surveyId: "s1", answers: { q1: "A" }, createdAt: "" },
          { id: "r3", surveyId: "s1", answers: { q1: "B" }, createdAt: "" },
        ]),
      },
    }));

    const { computeStats } = await import("./service.js");
    const survey: Survey = {
      id: "s1", creatorUserId: "u1", title: "Test", description: "",
      questions: [makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["A", "B", "C"], required: true })],
      status: "published", recipientConfig: { department_ids: [], user_ids: [], department_names: [], user_names: [] },
      createdAt: "", updatedAt: "",
    };

    const stats = await computeStats(survey);
    expect(stats.totalResponses).toBe(3);
    expect(stats.questions[0]!.distribution).toEqual({ A: 2, B: 1, C: 0 });
    expect(stats.questions[0]!.answeredCount).toBe(3);
    expect(stats.questions[0]!.visibleCount).toBe(3);
  });

  it("computes rating average and distribution", async () => {
    vi.doMock("../../lib/store", () => ({
      surveyResponseStore: {
        listBySurvey: () => Promise.resolve([
          { id: "r1", surveyId: "s1", answers: { q1: 5 }, createdAt: "" },
          { id: "r2", surveyId: "s1", answers: { q1: 3 }, createdAt: "" },
          { id: "r3", surveyId: "s1", answers: { q1: 5 }, createdAt: "" },
          { id: "r4", surveyId: "s1", answers: { q1: 1 }, createdAt: "" },
        ]),
      },
    }));

    const { computeStats } = await import("./service.js");
    const survey: Survey = {
      id: "s1", creatorUserId: "u1", title: "Test", description: "",
      questions: [makeQuestion({ id: "q1", type: "rating", title: "Q1", required: true })],
      status: "published", recipientConfig: { department_ids: [], user_ids: [], department_names: [], user_names: [] },
      createdAt: "", updatedAt: "",
    };

    const stats = await computeStats(survey);
    expect(stats.questions[0]!.average).toBe(3.5);
    expect(stats.questions[0]!.ratingDistribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  it("respects visibleCount for conditional questions", async () => {
    const questions: SurveyQuestion[] = [
      makeQuestion({ id: "q1", type: "single_choice", title: "Q1", options: ["Yes", "No"], required: true }),
      makeQuestion({ id: "q2", type: "text", title: "Q2", showIf: { questionId: "q1", op: "eq", value: "Yes" } }),
    ];

    vi.doMock("../../lib/store", () => ({
      surveyResponseStore: {
        listBySurvey: () => Promise.resolve([
          { id: "r1", surveyId: "s1", answers: { q1: "Yes", q2: "细节1" }, createdAt: "" },
          { id: "r2", surveyId: "s1", answers: { q1: "No" }, createdAt: "" },
          { id: "r3", surveyId: "s1", answers: { q1: "Yes", q2: "细节2" }, createdAt: "" },
        ]),
      },
    }));

    const { computeStats } = await import("./service.js");
    const survey: Survey = {
      id: "s1", creatorUserId: "u1", title: "Test", description: "", questions,
      status: "published", recipientConfig: { department_ids: [], user_ids: [], department_names: [], user_names: [] },
      createdAt: "", updatedAt: "",
    };

    const stats = await computeStats(survey);
    expect(stats.questions[1]!.visibleCount).toBe(2);
    expect(stats.questions[1]!.answeredCount).toBe(2);
    expect(stats.questions[0]!.visibleCount).toBe(3);
  });
});

// ============================================================
// generateSurvey (axes mock via top-level vi.mock)
// ============================================================
describe("generateSurvey", () => {
  it("parses valid JSON response from LLM", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { choices: [{ message: { content: JSON.stringify({
        title: "测试问卷", description: "一份测试问卷",
        questions: [
          { type: "single_choice", title: "题目1", options: ["A", "B"], required: true },
          { type: "text", title: "题目2", required: false },
        ],
      }) } }] },
    } as any);

    const { generateSurvey } = await import("./service.js");
    const result = await generateSurvey({ description: "测试" });
    expect(result.title).toBe("测试问卷");
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]!.id).toBe("q1");
    expect(result.questions[1]!.id).toBe("q2");
  });

  it("handles JSON in markdown code block", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { choices: [{ message: {
        content: '```json\n{"title":"T","description":"D","questions":[{"type":"text","title":"Q","required":true}]}\n```',
      } }] },
    } as any);

    const { generateSurvey } = await import("./service.js");
    const result = await generateSurvey({ description: "测试" });
    expect(result.title).toBe("T");
    expect(result.questions[0]!.id).toBe("q1");
  });

  it("throws when LLM returns invalid JSON", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { choices: [{ message: { content: "这不是JSON" } }] },
    } as any);

    const { generateSurvey } = await import("./service.js");
    await expect(generateSurvey({ description: "测试" })).rejects.toThrow("无法解析");
  });

  it("throws when LLM returns empty questions", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { choices: [{ message: { content: '{"title":"T","description":"D","questions":[]}' } }] },
    } as any);

    const { generateSurvey } = await import("./service.js");
    await expect(generateSurvey({ description: "测试" })).rejects.toThrow("缺少必填字段");
  });
});
