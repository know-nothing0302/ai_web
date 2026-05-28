"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.birthdayRouter = void 0;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const express_1 = require("express");
const zod_1 = require("zod");
const logger_1 = require("../../lib/logger");
const db_1 = require("../../lib/db");
const auth_1 = require("../../middleware/auth");
const client_1 = require("../wecom/client");
const birthday_1 = require("../../jobs/birthday");
const CARD_OUTPUT_DIR = "/tmp/birthday-cards";
const spawnPython = (scriptPath, input) => new Promise((resolve, reject) => {
    const child = (0, node_child_process_1.spawn)("python3", [scriptPath]);
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
        if (code === 0)
            resolve();
        else
            reject(new Error(`python3 exit ${code}: stdout=${stdout.trim()} stderr=${stderr.trim()}`));
    });
    child.stdin.write(input);
    child.stdin.end();
});
exports.birthdayRouter = (0, express_1.Router)();
// --- Existing: generate birthday card ---
exports.birthdayRouter.post("/generate", auth_1.requireAdminOrInternalToken, async (req, res) => {
    try {
        const { xm, csrq } = req.body;
        if (!xm || !csrq) {
            res.status(400).json({ message: "缺少必填参数 xm 或 csrq" });
            return;
        }
        const now = new Date();
        const month = now.getMonth() + 1;
        const templatePath = (0, node_path_1.join)(__dirname, "..", "..", "image", `${month}.psd`);
        await (0, promises_1.mkdir)(CARD_OUTPUT_DIR, { recursive: true });
        const outputPath = (0, node_path_1.join)(CARD_OUTPUT_DIR, `${(0, node_crypto_1.randomUUID)()}.png`);
        const inputJson = JSON.stringify({
            xm,
            csrq,
            template: templatePath,
            output: outputPath,
        });
        const scriptPath = (0, node_path_1.join)(__dirname, "..", "..", "scripts", "gen_birthday_card.py");
        logger_1.logger.info("birthday.generate.start", { xm, csrq, outputPath });
        await spawnPython(scriptPath, inputJson);
        res.json({ message: "生日贺卡生成成功", outputPath });
    }
    catch (error) {
        logger_1.logger.error("birthday.generate.failed", { error: error.message });
        res
            .status(500)
            .json({ message: "生日贺卡生成失败", detail: error.message });
    }
});
// --- Existing: push-test for internal token ---
exports.birthdayRouter.post("/push-test", auth_1.requireInternalToken, async (req, res) => {
    try {
        let xm, csrq;
        if (req.body.xm && req.body.csrq) {
            xm = req.body.xm;
            csrq = req.body.csrq;
            logger_1.logger.info("birthday.push_test.using_body", { xm, csrq });
        }
        else {
            const result = await (0, db_1.query)(`SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
           FROM users
           WHERE TO_CHAR(csrq, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD')
           LIMIT 1`);
            if (result.rows.length === 0) {
                res.status(404).json({ message: "今天没有过生日的用户" });
                return;
            }
            xm = result.rows[0].xm;
            csrq = result.rows[0].csrq;
        }
        logger_1.logger.info("birthday.push_test.found_user", { xm });
        const cardPath = await (0, birthday_1.generateCard)(xm, csrq);
        const mediaId = await client_1.wecomClient.uploadImage(cardPath);
        const targets = ["100002013029"];
        if (req.body.targetUserId) {
            targets.push(req.body.targetUserId);
        }
        await Promise.all(targets.map((t) => client_1.wecomClient.sendImageMessage({ touser: t, mediaId })));
        res.json({ message: "测试推送成功", name: xm, cardPath, targets });
    }
    catch (error) {
        logger_1.logger.error("birthday.push_test.failed", { error: error.message });
        res.status(500).json({ message: "测试推送失败", detail: error.message });
    }
});
// --- POST /preview --- generate card preview image, return as base64 ---
const previewSchema = zod_1.z.object({
    xm: zod_1.z.string().trim().min(1),
    csrq: zod_1.z.string().trim().min(1),
    blessing: zod_1.z.string().trim().min(1).max(500),
});
exports.birthdayRouter.post("/preview", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const parsed = previewSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
            return;
        }
        const { xm, csrq, blessing } = parsed.data;
        const cardPath = await (0, birthday_1.generateCard)(xm, csrq);
        const imageData = (0, node_fs_1.readFileSync)(cardPath);
        const cardBase64 = `data:image/png;base64,${imageData.toString("base64")}`;
        logger_1.logger.info("birthday.preview.success", { xm, cardPath });
        res.json({ cardBase64, xm, blessing });
    }
    catch (error) {
        logger_1.logger.error("birthday.preview.failed", { error: error.message });
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
exports.birthdayRouter.get("/users/search", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const keyword = req.query.keyword?.toString().trim();
        if (!keyword || keyword.length < 2) {
            res.status(400).json({ message: "关键词至少 2 个字符" });
            return;
        }
        const result = await (0, db_1.query)(`SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
       FROM users
       WHERE xm ILIKE $1 OR xh ILIKE $1
       ORDER BY xm
       LIMIT 20`, [`%${keyword}%`]);
        res.json({ items: result.rows });
    }
    catch (error) {
        logger_1.logger.error("birthday.users.search.failed", { error: error.message });
        res.status(500).json({ message: "搜索用户失败", detail: error.message });
    }
});
// --- GET /logs — paginated push history ---
const logsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    keyword: zod_1.z.string().optional(),
});
exports.birthdayRouter.get("/logs", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const parsed = logsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
            return;
        }
        const { page, pageSize, keyword } = parsed.data;
        const offset = (page - 1) * pageSize;
        let whereSql = "";
        const params = [];
        if (keyword?.trim()) {
            whereSql = "WHERE (xm ILIKE $1 OR user_xh ILIKE $1)";
            params.push(`%${keyword.trim()}%`);
        }
        const countResult = await (0, db_1.query)(`SELECT COUNT(*)::int AS total FROM birthday_push_log ${whereSql}`, params);
        const total = countResult.rows[0]?.total ?? 0;
        const itemsResult = await (0, db_1.query)(`SELECT id, user_xh, xm, csrq, card_path, blessing_text, pushed_at, status, pushed_to, error_message
       FROM birthday_push_log ${whereSql}
       ORDER BY pushed_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, String(pageSize), String(offset)]);
        res.json({
            items: itemsResult.rows,
            pagination: { page, pageSize, total },
        });
    }
    catch (error) {
        logger_1.logger.error("birthday.logs.failed", { error: error.message });
        res.status(500).json({ message: "获取推送日志失败", detail: error.message });
    }
});
// --- POST /resend — manual push: search user + custom blessing → send to 100002013029 ---
const resendSchema = zod_1.z.object({
    xh: zod_1.z.string().trim().min(1),
    blessing: zod_1.z.string().trim().min(1).max(500),
});
exports.birthdayRouter.post("/resend", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const parsed = resendSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
            return;
        }
        const { xh, blessing } = parsed.data;
        // Find user by xh
        const userResult = await (0, db_1.query)(`SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq FROM users WHERE xh = $1`, [xh]);
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
        const cardPath = await (0, birthday_1.generateCard)(xm, csrq);
        const mediaId = await client_1.wecomClient.uploadImage(cardPath);
        // Send blessing text + card image to test user
        const TEST_USER = "100002013029";
        await client_1.wecomClient.sendTextMessage({ touser: TEST_USER, content: blessing });
        await client_1.wecomClient.sendImageMessage({ touser: TEST_USER, mediaId });
        // Log to push log
        await (0, db_1.query)(`INSERT INTO birthday_push_log (user_xh, xm, csrq, card_path, blessing_text, status, pushed_to)
       VALUES ($1, $2, $3::date, $4, $5, 'success', $6)`, [xh, xm, csrq, cardPath, blessing, [TEST_USER]]);
        logger_1.logger.info("birthday.resend.success", { xh, xm, cardPath });
        res.json({ message: "推送成功", name: xm, cardPath, status: "success", pushedTo: [TEST_USER] });
    }
    catch (error) {
        logger_1.logger.error("birthday.resend.failed", { error: error.message });
        const message = error.message || "推送失败";
        res.status(500).json({ message: "推送失败", detail: message, name: req.body.xm || "未知", status: "failed", errorCode: "WECOM_API_ERROR" });
    }
});
// --- GET /blessing — get current blessing template ---
exports.birthdayRouter.get("/blessing", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const result = await (0, db_1.query)("SELECT blessing_template FROM birthday_config LIMIT 1");
        const template = result.rows[0]?.blessing_template ?? "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
        res.json({ blessingTemplate: template });
    }
    catch (error) {
        logger_1.logger.error("birthday.blessing.get.failed", { error: error.message });
        res.status(500).json({ message: "获取祝福语模板失败", detail: error.message });
    }
});
// --- PUT /blessing — update blessing template ---
const blessingSchema = zod_1.z.object({
    blessingTemplate: zod_1.z.string().trim().min(1).max(500),
});
exports.birthdayRouter.put("/blessing", auth_1.requireContentHubOperator, async (req, res) => {
    try {
        const parsed = blessingSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
            return;
        }
        const { blessingTemplate } = parsed.data;
        await (0, db_1.query)(`UPDATE birthday_config SET blessing_template = $1, updated_at = NOW() WHERE id = (SELECT id FROM birthday_config LIMIT 1)`, [blessingTemplate]);
        logger_1.logger.info("birthday.blessing.updated", { template: blessingTemplate });
        res.json({ message: "祝福语模板已更新", blessingTemplate });
    }
    catch (error) {
        logger_1.logger.error("birthday.blessing.update.failed", { error: error.message });
        res.status(500).json({ message: "更新祝福语模板失败", detail: error.message });
    }
});
