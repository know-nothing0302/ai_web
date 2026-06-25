import axios from "axios";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  surveyResponseStore,
} from "../../lib/store";
import type { Survey, SurveyQuestion, SurveyResponse } from "../../lib/types";
import type {
  GenerateSurveyInput,
  GenerateSurveyOutput,
  QuestionStat,
  SurveyStats,
} from "./types";

const SURVEY_GENERATION_PROMPT = `你是一个专业的问卷设计助手。根据用户需求生成一份标准化问卷 JSON。
输出格式必须严格遵循以下 schema，不要输出任何非 JSON 内容：
{
  "title": "问卷标题（≤30字）",
  "description": "问卷说明（≤200字）",
  "questions": [
    {
      "id": "q1",
      "type": "single_choice|multiple_choice|text|rating",
      "title": "题目（≤50字）",
      "options": ["选项A", "选项B"],
      "required": true|false,
      "showIf": { "questionId": "q3", "op": "eq|neq|includes", "value": "..." }
    }
  ]
}

规则：
- 问卷 5-15 题，题型搭配合理（不要全是一种题型）
- 选择题选项互斥且完备，2-8个选项
- 开放题（text）每份问卷不超过 3 道
- 避免诱导性、双重否定、模糊表述
- 标题和题目使用中文
- 当某题的回答会决定后续题目是否出现时，使用 showIf 建立跳转逻辑
  showIf 的 questionId 只能引用序号更小的题目，不能自引用或后向引用
- showIf 运算符：eq（等于）、neq（不等于）、includes（多选包含某选项）

示例输入: "新生入学适应情况调查"
示例输出:
{
  "title": "新生入学适应情况调查",
  "description": "了解新生入学后的适应状况，以便提供针对性帮助。",
  "questions": [
    {
      "id": "q1",
      "type": "rating",
      "title": "你对大学生活的整体适应程度如何？",
      "required": true
    },
    {
      "id": "q2",
      "type": "single_choice",
      "title": "目前最大的困难是什么？",
      "options": ["学习压力", "人际关系", "生活自理", "经济压力", "其他"],
      "required": true
    },
    {
      "id": "q3",
      "type": "text",
      "title": "请具体描述你遇到的困难。",
      "required": false,
      "showIf": {"questionId": "q2", "op": "neq", "value": "其他"}
    },
    {
      "id": "q4",
      "type": "text",
      "title": "请说明你遇到的其他困难。",
      "required": true,
      "showIf": {"questionId": "q2", "op": "eq", "value": "其他"}
    },
    {
      "id": "q5",
      "type": "multiple_choice",
      "title": "你希望学校提供哪些帮助？",
      "options": ["心理咨询", "学业辅导", "社团活动", "勤工助学", "职业规划"],
      "required": true
    }
  ]
}`;

const STATS_ANALYSIS_PROMPT = `你是数据分析助手。根据问卷结构和回收数据，生成一段 200-400 字的自然语言摘要。
指出：整体趋势、最突出的发现、值得关注的问题、可行建议。
语言简洁、具体，引用数据。不编造数据中没有的结论。`;

export async function generateSurvey(
  input: GenerateSurveyInput
): Promise<GenerateSurveyOutput> {
  if (!env.deepseekApiBaseUrl) {
    throw new Error("未配置 DEEPSEEK_API_BASE_URL");
  }

  const response = await axios.post(
    `${env.deepseekApiBaseUrl}/v1/chat/completions`,
    {
      model: env.deepseekModel,
      messages: [
        { role: "system", content: SURVEY_GENERATION_PROMPT },
        { role: "user", content: input.description },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    },
    {
      headers: env.deepseekApiKey
        ? { Authorization: `Bearer ${env.deepseekApiKey}` }
        : undefined,
      timeout: 60000,
    }
  );

  const rawContent = response.data?.choices?.[0]?.message?.content ?? "";

  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonText = rawContent.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1]!.trim();
  }

  let parsed: GenerateSurveyOutput;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    logger.warn("survey.generate.parse_failed", { rawContent: jsonText.substring(0, 500) });
    throw new Error("LLM 返回内容无法解析为 JSON，请重试");
  }

  if (
    !parsed.title ||
    !Array.isArray(parsed.questions) ||
    parsed.questions.length === 0
  ) {
    logger.warn("survey.generate.validation_failed", { parsed });
    throw new Error("LLM 生成的问卷缺少必填字段");
  }

  // Normalize question IDs to q1, q2, ...
  parsed.questions = parsed.questions.map((q, i) => ({
    ...q,
    id: `q${i + 1}`,
  }));

  return parsed;
}

export function isQuestionVisible(
  question: SurveyQuestion,
  answers: Record<string, unknown>,
  allQuestions: SurveyQuestion[]
): boolean {
  if (!question.showIf) return true;

  const { questionId, op, value } = question.showIf;
  const answer = answers[questionId];

  // If the dependency question is itself hidden, this one is too
  const depQuestion = allQuestions.find((q) => q.id === questionId);
  if (depQuestion && !isQuestionVisible(depQuestion, answers, allQuestions)) {
    return false;
  }

  if (answer === undefined || answer === null) return false;

  switch (op) {
    case "eq":
      return String(answer) === String(value);
    case "neq":
      return String(answer) !== String(value);
    case "includes": {
      const arr = Array.isArray(answer) ? answer : [answer];
      return arr.map(String).includes(String(value));
    }
    default:
      return true;
  }
}

export function getVisibleQuestions(
  questions: SurveyQuestion[],
  answers: Record<string, unknown>
): SurveyQuestion[] {
  return questions.filter((q) => isQuestionVisible(q, answers, questions));
}

export function validateResponse(
  questions: SurveyQuestion[],
  answers: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const q of questions) {
    const isVisible = isQuestionVisible(q, answers, questions);

    if (!isVisible) {
      // Hidden questions should not have answers
      if (answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "") {
        errors.push(`题目 "${q.title}" 不可见，不应有回答`);
      }
      continue;
    }

    const answer = answers[q.id];

    if (q.required && (answer === undefined || answer === null || answer === "")) {
      errors.push(`题目 "${q.title}" 为必答题`);
      continue;
    }

    if (answer !== undefined && answer !== null && answer !== "") {
      // Validate answer type matches question type
      switch (q.type) {
        case "single_choice":
          if (q.options && !q.options.includes(String(answer))) {
            errors.push(`题目 "${q.title}" 的选项无效`);
          }
          break;
        case "multiple_choice":
          if (Array.isArray(answer)) {
            if (q.options) {
              const invalid = answer.filter((a) => !q.options!.includes(String(a)));
              if (invalid.length > 0) {
                errors.push(`题目 "${q.title}" 包含无效选项`);
              }
            }
          }
          break;
        case "rating":
          if (typeof answer === "string") {
            const n = Number(answer);
            if (!Number.isFinite(n) || n < 1 || n > 5) {
              errors.push(`题目 "${q.title}" 评分需在 1-5 之间`);
            }
          } else if (typeof answer !== "number" || answer < 1 || answer > 5) {
            errors.push(`题目 "${q.title}" 评分需在 1-5 之间`);
          }
          break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function computeStats(survey: Survey): Promise<SurveyStats> {
  const responses = await surveyResponseStore.listBySurvey(survey.id, 10000, 0);
  const questions = survey.questions;

  const questionStats: QuestionStat[] = questions.map((q) => {
    const visibleCount = responses.filter((r) =>
      isQuestionVisible(q, r.answers, questions)
    ).length;
    const answered = responses.filter(
      (r) =>
        isQuestionVisible(q, r.answers, questions) &&
        r.answers[q.id] !== undefined &&
        r.answers[q.id] !== null &&
        r.answers[q.id] !== ""
    );

    const answeredCount = answered.length;

    const stat: QuestionStat = {
      questionId: q.id,
      questionTitle: q.title,
      type: q.type,
      visibleCount,
      answeredCount,
    };

    switch (q.type) {
      case "single_choice": {
        const distribution: Record<string, number> = {};
        if (q.options) {
          for (const opt of q.options) {
            distribution[opt] = 0;
          }
        }
        for (const r of answered) {
          const val = String(r.answers[q.id] ?? "");
          distribution[val] = (distribution[val] ?? 0) + 1;
        }
        stat.distribution = distribution;
        break;
      }
      case "multiple_choice": {
        const distribution: Record<string, number> = {};
        if (q.options) {
          for (const opt of q.options) {
            distribution[opt] = 0;
          }
        }
        for (const r of answered) {
          const val = r.answers[q.id];
          const arr = Array.isArray(val) ? val : [val];
          for (const item of arr) {
            const s = String(item);
            distribution[s] = (distribution[s] ?? 0) + 1;
          }
        }
        stat.distribution = distribution;
        break;
      }
      case "rating": {
        let sum = 0;
        let count = 0;
        const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of answered) {
          const val = Number(r.answers[q.id]);
          if (Number.isFinite(val) && val >= 1 && val <= 5) {
            sum += val;
            count++;
            ratingDist[val] = (ratingDist[val] ?? 0) + 1;
          }
        }
        stat.average = count > 0 ? Math.round((sum / count) * 10) / 10 : undefined;
        stat.ratingDistribution = ratingDist;
        break;
      }
      case "text": {
        stat.textResponses = answered
          .map((r) => String(r.answers[q.id] ?? ""))
          .filter((s) => s.trim().length > 0)
          .slice(0, 100);
        break;
      }
    }

    return stat;
  });

  return {
    totalResponses: responses.length,
    questions: questionStats,
  };
}

export async function analyzeStats(
  survey: Survey,
  stats: SurveyStats
): Promise<string> {
  if (!env.deepseekApiBaseUrl) {
    throw new Error("未配置 DEEPSEEK_API_BASE_URL");
  }

  const contextForLLM = {
    title: survey.title,
    description: survey.description,
    totalResponses: stats.totalResponses,
    questions: stats.questions.map((q) => ({
      id: q.questionId,
      title: q.questionTitle,
      type: q.type,
      visibleCount: q.visibleCount,
    })),
    data: Object.fromEntries(
      stats.questions.map((q) => [
        q.questionId,
        q.type === "single_choice" || q.type === "multiple_choice"
          ? q.distribution
          : q.type === "rating"
            ? { average: q.average, distribution: q.ratingDistribution }
            : q.textResponses?.slice(0, 30),
      ])
    ),
  };

  const response = await axios.post(
    `${env.deepseekApiBaseUrl}/v1/chat/completions`,
    {
      model: env.deepseekModel,
      messages: [
        { role: "system", content: STATS_ANALYSIS_PROMPT },
        {
          role: "user",
          content: JSON.stringify(contextForLLM, null, 2),
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    },
    {
      headers: env.deepseekApiKey
        ? { Authorization: `Bearer ${env.deepseekApiKey}` }
        : undefined,
      timeout: 60000,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content ?? "";
  // Clean think tags if present
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
