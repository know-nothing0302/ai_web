import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { query } from "../../lib/db";
import { requireAdmin, requireAdminOrInternalToken, requireInternalToken, requireContentHubOperator } from "../../middleware/auth";
import { wecomClient } from "../wecom/client";
import { generateCard } from "../../jobs/birthday";

const CARD_OUTPUT_DIR = "/tmp/birthday-cards";

const spawnPython = (scriptPath: string, input: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath]);
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`python3 exit ${code}: stdout=${stdout.trim()} stderr=${stderr.trim()}`));
    });
    child.stdin!.write(input);
    child.stdin!.end();
  });

export const birthdayRouter = Router();

// --- Existing: generate birthday card ---
birthdayRouter.post(
  "/generate",
  requireAdminOrInternalToken,
  async (req, res) => {
    try {
      const { xm, csrq } = req.body;
      if (!xm || !csrq) {
        res.status(400).json({ message: "缺少必填参数 xm 或 csrq" });
        return;
      }

      const now = new Date();
      const month = now.getMonth() + 1;
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "image",
        `${month}.psd`
      );

      await mkdir(CARD_OUTPUT_DIR, { recursive: true });
      const outputPath = join(CARD_OUTPUT_DIR, `${randomUUID()}.png`);

      const inputJson = JSON.stringify({
        xm,
        csrq,
        template: templatePath,
        output: outputPath,
      });

      const scriptPath = join(__dirname, "..", "..", "scripts", "gen_birthday_card.py");
      logger.info("birthday.generate.start", { xm, csrq, outputPath });
      await spawnPython(scriptPath, inputJson);

      res.json({ message: "生日贺卡生成成功", outputPath });
    } catch (error: any) {
      logger.error("birthday.generate.failed", { error: error.message });
      res
        .status(500)
        .json({ message: "生日贺卡生成失败", detail: error.message });
    }
  }
);

// --- Existing: push-test for internal token ---
birthdayRouter.post(
  "/push-test",
  requireInternalToken,
  async (req, res) => {
    try {
      let xm: string, csrq: string;

      if (req.body.xm && req.body.csrq) {
        xm = req.body.xm;
        csrq = req.body.csrq;
        logger.info("birthday.push_test.using_body", { xm, csrq });
      } else {
        const result = await query<{ xh: string; xm: string; csrq: string }>(
          `SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
           FROM users
           WHERE TO_CHAR(csrq, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD')
           LIMIT 1`
        );
        if (result.rows.length === 0) {
          res.status(404).json({ message: "今天没有过生日的用户" });
          return;
        }
        xm = result.rows[0].xm;
        csrq = result.rows[0].csrq;
      }

      logger.info("birthday.push_test.found_user", { xm });

      const cardPath = await generateCard(xm, csrq);
      const mediaId = await wecomClient.uploadImage(cardPath);

      const targets = ["100002013029"];
      if (req.body.targetUserId) {
        targets.push(req.body.targetUserId);
      }

      await Promise.all(targets.map((t) => wecomClient.sendImageMessage({ touser: t, mediaId })));

      res.json({ message: "测试推送成功", name: xm, cardPath, targets });
    } catch (error: any) {
      logger.error("birthday.push_test.failed", { error: error.message });
      res.status(500).json({ message: "测试推送失败", detail: error.message });
    }
  }
);

// --- POST /preview --- generate card preview image, return as base64 ---
const previewSchema = z.object({
  xm: z.string().trim().min(1),
  csrq: z.string().trim().min(1),
  blessing: z.string().trim().min(1).max(500),
});

birthdayRouter.post("/preview", requireContentHubOperator, async (req, res) => {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    const { xm, csrq, blessing } = parsed.data;
    const cardPath = await generateCard(xm, csrq);
    const imageData = readFileSync(cardPath);
    const cardBase64 = `data:image/png;base64,${imageData.toString("base64")}`;

    logger.info("birthday.preview.success", { xm, cardPath });

    res.json({ cardBase64, xm, blessing });
  } catch (error: any) {
    logger.error("birthday.preview.failed", { error: error.message });
    res.status(500).json({ message: "预览生成失败", detail: error.message });
  }
});

// ============================================================
// NEW: Admin endpoints for birthday push management
// ============================================================

// ============================================================
// NEW: Admin endpoints for birthday push management
// ============================================================

// --- GET /users/search — search users by xm/xh ---
birthdayRouter.get("/users/search", requireContentHubOperator, async (req, res) => {
  try {
    const keyword = req.query.keyword?.toString().trim();
    if (!keyword || keyword.length < 2) {
      res.status(400).json({ message: "关键词至少 2 个字符" });
      return;
    }
    const result = await query<{ xh: string; xm: string; csrq: string | null }>(
      `SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
       FROM users
       WHERE xm ILIKE $1 OR xh ILIKE $1
       ORDER BY xm
       LIMIT 20`,
      [`%${keyword}%`]
    );
    res.json({ items: result.rows });
  } catch (error: any) {
    logger.error("birthday.users.search.failed", { error: error.message });
    res.status(500).json({ message: "搜索用户失败", detail: error.message });
  }
});

// --- GET /logs — paginated push history ---
const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().optional(),
});

birthdayRouter.get("/logs", requireContentHubOperator, async (req, res) => {
  try {
    const parsed = logsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    const { page, pageSize, keyword } = parsed.data;
    const offset = (page - 1) * pageSize;

    let whereSql = "";
    const params: string[] = [];
    if (keyword?.trim()) {
      whereSql = "WHERE (xm ILIKE $1 OR user_xh ILIKE $1)";
      params.push(`%${keyword.trim()}%`);
    }

    const countResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM birthday_push_log ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;

    const itemsResult = await query<{
      id: string;
      userXh: string;
      xm: string;
      csrq: string | null;
      cardPath: string | null;
      blessingText: string | null;
      pushedAt: string;
      status: string;
      pushedTo: string[];
      errorMessage: string | null;
    }>(
      `SELECT id, user_xh AS "userXh", xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq, card_path AS "cardPath", blessing_text AS "blessingText", pushed_at AS "pushedAt", status, pushed_to AS "pushedTo", error_message AS "errorMessage"
       FROM birthday_push_log ${whereSql}
       ORDER BY pushed_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, String(pageSize), String(offset)]
    );

    res.json({
      items: itemsResult.rows,
      pagination: { page, pageSize, total },
    });
  } catch (error: any) {
    logger.error("birthday.logs.failed", { error: error.message });
    res.status(500).json({ message: "获取推送日志失败", detail: error.message });
  }
});

// --- POST /resend — manual push: search user + custom blessing → send to 100002013029 ---
const resendSchema = z.object({
  xh: z.string().trim().min(1),
  blessing: z.string().trim().min(1).max(500),
});

birthdayRouter.post("/resend", requireContentHubOperator, async (req, res) => {
  try {
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    const { xh, blessing } = parsed.data;

    // Find user by xh
    const userResult = await query<{ xh: string; xm: string; csrq: string | null }>(
      `SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq FROM users WHERE xh = $1`,
      [xh]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ message: `未找到学号/工号为 ${xh} 的用户` });
      return;
    }

    const { xm, csrq } = userResult.rows[0];
    if (!csrq) {
      res.status(400).json({ message: `用户 ${xm}(${xh}) 未设置出生日期` });
      return;
    }

    // Generate card
    const cardPath = await generateCard(xm, csrq);
    const mediaId = await wecomClient.uploadImage(cardPath);

    // Send blessing text + card image to test user
    const TEST_USER = "100002013029";
    await wecomClient.sendTextMessage({ touser: TEST_USER, content: blessing });
    await wecomClient.sendImageMessage({ touser: TEST_USER, mediaId });

    // Log to push log
    await query(
      `INSERT INTO birthday_push_log (user_xh, xm, csrq, card_path, blessing_text, status, pushed_to)
       VALUES ($1, $2, $3::date, $4, $5, 'success', $6)`,
      [xh, xm, csrq, cardPath, blessing, [TEST_USER]]
    );

    logger.info("birthday.resend.success", { xh, xm, cardPath });

    res.json({ message: "推送成功", name: xm, cardPath, status: "success", pushedTo: [TEST_USER] });
  } catch (error: any) {
    logger.error("birthday.resend.failed", { error: error.message });
    const message = error.message || "推送失败";
    res.status(500).json({ message: "推送失败", detail: message, name: req.body.xm || "未知", status: "failed", errorCode: "WECOM_API_ERROR" });
  }
});

// --- GET /blessing — get current blessing template ---
birthdayRouter.get("/blessing", requireContentHubOperator, async (req, res) => {
  try {
    const result = await query<{ blessing_template: string }>(
      "SELECT blessing_template FROM birthday_config LIMIT 1"
    );
    const template = result.rows[0]?.blessing_template ?? "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
    res.json({ blessingTemplate: template });
  } catch (error: any) {
    logger.error("birthday.blessing.get.failed", { error: error.message });
    res.status(500).json({ message: "获取祝福语模板失败", detail: error.message });
  }
});

// --- PUT /blessing — update blessing template ---
const blessingSchema = z.object({
  blessingTemplate: z.string().trim().min(1).max(500),
});

birthdayRouter.put("/blessing", requireContentHubOperator, async (req, res) => {
  try {
    const parsed = blessingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
      return;
    }

    const { blessingTemplate } = parsed.data;

    await query(
      `UPDATE birthday_config SET blessing_template = $1, updated_at = NOW() WHERE id = (SELECT id FROM birthday_config LIMIT 1)`,
      [blessingTemplate]
    );

    logger.info("birthday.blessing.updated", { template: blessingTemplate });
    res.json({ message: "祝福语模板已更新", blessingTemplate });
  } catch (error: any) {
    logger.error("birthday.blessing.update.failed", { error: error.message });
    res.status(500).json({ message: "更新祝福语模板失败", detail: error.message });
  }
});
