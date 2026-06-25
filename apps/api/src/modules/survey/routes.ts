import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { surveyStore, surveyResponseStore } from "../../lib/store";
import { requireAuth } from "../../middleware/auth";
import { pageAgentQaRateLimiter } from "../../middleware/rate_limit";
import { wecomClient } from "../wecom/client";
import {
  computeStats,
  analyzeStats,
  editQuestions,
  generateSurvey,
  validateResponse,
} from "./service";

const getAuthenticatedUserId = (request: {
  session: { user?: { id: string } };
}): string | undefined => {
  if (request.session.user?.id) {
    return request.session.user.id;
  }
  return env.devAuthBypass ? "dev-mock-id" : undefined;
};

// --- Zod schemas ---

const generateSchema = z.object({
  description: z.string().trim().min(1).max(2000),
});

const createSurveySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).default(""),
  questions: z.array(
    z.object({
      id: z.string().min(1).max(10),
      type: z.enum(["single_choice", "multiple_choice", "text", "rating"]),
      title: z.string().trim().min(1).max(200),
      options: z.array(z.string().trim().min(1).max(200)).optional(),
      required: z.boolean().default(true),
      showIf: z
        .object({
          questionId: z.string().min(1).max(10),
          op: z.enum(["eq", "neq", "includes"]),
          value: z.string(),
        })
        .optional(),
    })
  ).min(1).max(50),
});

const updateSurveySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  questions: createSurveySchema.shape.questions.optional(),
});

const publishSchema = z.object({
  department_ids: z.array(z.number()).default([]),
  user_ids: z.array(z.string()).default([]),
  department_names: z.array(z.string()).default([]),
  user_names: z.array(z.string()).default([]),
});

const respondSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  token: z.string().min(1),
});

const editQuestionsSchema = z.object({
  questions: createSurveySchema.shape.questions,
  instruction: z.string().trim().min(1).max(1000),
});

// --- Helpers ---

const generatePublishToken = (): string =>
  crypto.randomBytes(16).toString("hex");

const validateTokenAccess = async (
  surveyId: string,
  token: string
): Promise<boolean> => {
  const survey = await surveyStore.getById(surveyId);
  if (!survey) return false;
  return survey.publishToken === token;
};

// --- Router ---

export const surveyRouter = Router();

// POST /api/survey/generate — LLM 生成问卷
surveyRouter.post("/generate", requireAuth, pageAgentQaRateLimiter, async (request, response) => {
  const parsed = generateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  try {
    const result = await generateSurvey(parsed.data);
    response.json(result);
  } catch (error) {
    logger.error("survey.generate.failed", {
      userId,
      error: (error as Error).message,
    });
    response.status(500).json({
      message: "生成失败",
      detail: (error as Error).message,
    });
  }
});

// POST /api/survey/edit-questions — LLM 自然语言编辑题目
surveyRouter.post("/edit-questions", requireAuth, pageAgentQaRateLimiter, async (request, response) => {
  const parsed = editQuestionsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  try {
    const result = await editQuestions(parsed.data.questions, parsed.data.instruction);
    response.json(result);
  } catch (error) {
    logger.error("survey.edit.questions.failed", {
      userId,
      error: (error as Error).message,
    });
    response.status(500).json({
      message: "编辑失败",
      detail: (error as Error).message,
    });
  }
});

// POST /api/survey — 创建问卷
surveyRouter.post("/", requireAuth, async (request, response) => {
  const parsed = createSurveySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const survey = await surveyStore.create({
    creatorUserId: userId,
    title: parsed.data.title,
    description: parsed.data.description,
    questions: parsed.data.questions,
    status: "draft",
  });
  logger.info("survey.created", {
    userId,
    surveyId: survey.id,
    questionCount: survey.questions.length,
  });
  response.status(201).json(survey);
});

// GET /api/survey — 列出我的问卷
surveyRouter.get("/", requireAuth, async (request, response) => {
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  const limit = Math.max(1, Math.min(Number(request.query.limit) || 20, 50));
  const offset = Math.max(0, Number(request.query.offset) || 0);
  const items = await surveyStore.listByCreatorWithResponseCounts(
    userId,
    limit,
    offset
  );
  const total = await surveyStore.countByCreator(userId);

  response.json({ items, total });
});

// GET /api/survey/wecom/departments — 企微部门树
surveyRouter.get("/wecom/departments", requireAuth, async (request, response) => {
  try {
    const parentId = request.query.parent_id
      ? Number(request.query.parent_id)
      : undefined;
    const departments = await wecomClient.listDepartments(
      Number.isFinite(parentId) ? parentId : undefined
    );
    response.json({ departments });
  } catch (error) {
    logger.error("survey.wecom.departments.failed", {
      error: (error as Error).message,
    });
    response.status(500).json({
      message: "获取部门列表失败",
      detail: (error as Error).message,
    });
  }
});

// GET /api/survey/wecom/departments/:id/users — 部门成员
surveyRouter.get(
  "/wecom/departments/:id/users",
  requireAuth,
  async (request, response) => {
    const departmentId = Number(request.params.id);
    if (!Number.isFinite(departmentId) || departmentId <= 0) {
      response.status(400).json({ message: "无效的部门 ID" });
      return;
    }
    const fetchChild = request.query.fetch_child === "1" ? 1 : 0;
    try {
      const users = await wecomClient.listDepartmentUsers(
        departmentId,
        fetchChild as 0 | 1
      );
      response.json({ users });
    } catch (error) {
      logger.error("survey.wecom.department_users.failed", {
        departmentId,
        error: (error as Error).message,
      });
      response.status(500).json({
        message: "获取部门成员失败",
        detail: (error as Error).message,
      });
    }
  }
);

// GET /api/survey/:id — 获取问卷详情
surveyRouter.get("/:id", async (request, response) => {
  const idOrToken = String(request.params.id);
  let survey = await surveyStore.getById(idOrToken);

  // Fallback: try publish token lookup
  if (!survey) {
    survey = await surveyStore.getByPublishToken(idOrToken);
  }

  if (!survey) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  const userId = getAuthenticatedUserId(request);

  // Creator access: full detail
  if (userId && survey.creatorUserId === userId) {
    const responseCount = await surveyResponseStore.countBySurvey(survey.id);
    response.json({ ...survey, responseCount, isCreator: true });
    return;
  }

  // Public access via token
  const token = String(request.query.token ?? "");
  if (survey.status === "published" && survey.publishToken === token) {
    // Return only what's needed to fill the form
    response.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      questions: survey.questions,
      status: survey.status,
      isCreator: false,
      // Don't expose recipient config or other metadata
    });
    return;
  }

  response.status(404).json({ message: "问卷不存在或无权访问" });
});

// PATCH /api/survey/:id — 更新问卷
surveyRouter.patch("/:id", requireAuth, async (request, response) => {
  const surveyId = String(request.params.id);
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  const survey = await surveyStore.getById(surveyId);
  if (!survey || survey.creatorUserId !== userId) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  if (survey.status !== "draft") {
    response.status(400).json({ message: "只能修改草稿状态的问卷" });
    return;
  }

  const parsed = updateSurveySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  const updated = await surveyStore.update(surveyId, parsed.data);
  response.json(updated);
});

// POST /api/survey/:id/publish — 发布问卷
surveyRouter.post("/:id/publish", requireAuth, async (request, response) => {
  const surveyId = String(request.params.id);
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  const survey = await surveyStore.getById(surveyId);
  if (!survey || survey.creatorUserId !== userId) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  if (survey.status === "published") {
    response.status(400).json({ message: "问卷已发布" });
    return;
  }

  const parsed = publishSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  const token = generatePublishToken();
  const webBase = env.webBaseUrl.replace(/\/+$/, "");
  const shareUrl = `${webBase}/s/${token}`;

  const recipientConfig = {
    department_ids: parsed.data.department_ids,
    user_ids: parsed.data.user_ids,
    department_names: parsed.data.department_names,
    user_names: parsed.data.user_names,
  };

  // Persist survey state first
  const updated = await surveyStore.update(surveyId, {
    status: "published",
    publishToken: token,
    recipientConfig,
  });

  logger.info("survey.published", {
    surveyId,
    userId,
    hasRecipients:
      recipientConfig.department_ids.length > 0 ||
      recipientConfig.user_ids.length > 0,
  });

  // Push via WeChat Work if recipients specified (after state persisted)
  let pushResult: { invalidUserIds: string[] } | undefined;
  const hasRecipients =
    recipientConfig.department_ids.length > 0 ||
    recipientConfig.user_ids.length > 0;

  if (hasRecipients) {
    try {
      pushResult = await wecomClient.sendTemplateCard({
        toparty: recipientConfig.department_ids.join("|") || undefined,
        touser: recipientConfig.user_ids.join("|") || undefined,
        templateCard: {
          card_type: "text_notice",
          source: {
            desc: "AI 问卷",
            desc_color: 3,
          },
          main_title: {
            title: survey.title,
            desc: `共 ${survey.questions.length} 题`,
          },
          sub_title_text: survey.description || "点击填写问卷",
          horizontal_content_list: [
            {
              keyname: "创建者",
              value: userId,
            },
            {
              keyname: "填写问卷",
              value: "点击查看",
              type: 1,
              url: shareUrl,
            },
          ],
          card_action: {
            type: 1,
            url: shareUrl,
          },
        },
      });
      logger.info("survey.publish.push_sent", {
        surveyId,
        departmentCount: recipientConfig.department_ids.length,
        userCount: recipientConfig.user_ids.length,
        invalidUserIds: pushResult.invalidUserIds,
      });
    } catch (error) {
      logger.warn("survey.publish.push_failed", {
        surveyId,
        error: (error as Error).message,
      });
      // Push failure doesn't affect publish status
    }
  }

  response.json({
    ...updated,
    shareUrl,
    pushResult: pushResult
      ? { invalidUserIds: pushResult.invalidUserIds }
      : undefined,
  });
});

// POST /api/survey/:id/close — 关闭问卷
surveyRouter.post("/:id/close", requireAuth, async (request, response) => {
  const surveyId = String(request.params.id);
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  const survey = await surveyStore.getById(surveyId);
  if (!survey || survey.creatorUserId !== userId) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  if (survey.status !== "published") {
    response.status(400).json({ message: "只能关闭已发布的问卷" });
    return;
  }

  const updated = await surveyStore.update(surveyId, { status: "closed" });
  response.json(updated);
});

// POST /api/survey/:id/respond — 提交答卷（公开）
surveyRouter.post("/:id/respond", async (request, response) => {
  const idOrToken = String(request.params.id);

  const parsed = respondSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
    return;
  }

  let survey = await surveyStore.getById(idOrToken);
  if (!survey) {
    survey = await surveyStore.getByPublishToken(idOrToken);
  }

  if (!survey || survey.publishToken !== parsed.data.token) {
    response.status(404).json({ message: "问卷不存在或无权访问" });
    return;
  }

  if (survey.status !== "published") {
    response.status(400).json({ message: "问卷已关闭，不再接受提交" });
    return;
  }

  // Validate answers against questions
  const validation = validateResponse(survey.questions, parsed.data.answers);
  if (!validation.valid) {
    response.status(400).json({ message: "提交内容有误", errors: validation.errors });
    return;
  }

  const userId = getAuthenticatedUserId(request);

  const result = await surveyResponseStore.create({
    surveyId: survey.id,
    respondentUserId: userId,
    answers: parsed.data.answers,
  });

  logger.info("survey.response.submitted", {
    surveyId: survey.id,
    respondentUserId: userId ?? "anonymous",
  });

  response.status(201).json({ id: result.id, message: "提交成功" });
});

// GET /api/survey/:id/responses — 查看答卷（创建者）
surveyRouter.get("/:id/responses", requireAuth, async (request, response) => {
  const surveyId = String(request.params.id);
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  const survey = await surveyStore.getById(surveyId);
  if (!survey || survey.creatorUserId !== userId) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  const limit = Math.max(1, Math.min(Number(request.query.limit) || 100, 500));
  const offset = Math.max(0, Number(request.query.offset) || 0);
  const items = await surveyResponseStore.listBySurvey(surveyId, limit, offset);
  const total = await surveyResponseStore.countBySurvey(surveyId);

  response.json({ items, total });
});

// GET /api/survey/:id/stats — 统计摘要
surveyRouter.get("/:id/stats", requireAuth, async (request, response) => {
  const surveyId = String(request.params.id);
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ message: "未登录" });
    return;
  }

  const survey = await surveyStore.getById(surveyId);
  if (!survey || survey.creatorUserId !== userId) {
    response.status(404).json({ message: "问卷不存在" });
    return;
  }

  const stats = await computeStats(survey);
  response.json(stats);
});

// POST /api/survey/:id/stats/analyze — AI 解读
surveyRouter.post(
  "/:id/stats/analyze",
  requireAuth,
  async (request, response) => {
    const surveyId = String(request.params.id);
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      response.status(401).json({ message: "未登录" });
      return;
    }

    const survey = await surveyStore.getById(surveyId);
    if (!survey || survey.creatorUserId !== userId) {
      response.status(404).json({ message: "问卷不存在" });
      return;
    }

    try {
      const stats = await computeStats(survey);
      const summary = await analyzeStats(survey, stats);
      response.json({ summary });
    } catch (error) {
      logger.error("survey.stats.analyze.failed", {
        surveyId,
        error: (error as Error).message,
      });
      response.status(500).json({
        message: "AI 解读失败",
        detail: (error as Error).message,
      });
    }
  }
);
