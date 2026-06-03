"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBirthdayJob = exports.runBirthdayPush = exports.generateCard = void 0;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const client_1 = require("../modules/wecom/client");
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
const TEST_USER_ID = "100002013029";
const getBirthdayUsers = async () => {
    const result = await (0, db_1.query)(`SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
     FROM users
     WHERE TO_CHAR(csrq, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD')`);
    return result.rows;
};
const getBlessingTemplate = async () => {
    try {
        const result = await (0, db_1.query)("SELECT blessing_template FROM birthday_config LIMIT 1");
        return result.rows[0]?.blessing_template ?? "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
    }
    catch {
        return "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
    }
};
const insertPushLog = async (userXh, xm, csrq, cardPath, blessingText, status, pushedTo, errorMessage) => {
    try {
        await (0, db_1.query)(`INSERT INTO birthday_push_log (user_xh, xm, csrq, card_path, blessing_text, status, pushed_to, error_message)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)`, [userXh, xm, csrq, cardPath, blessingText, status, pushedTo, errorMessage ?? null]);
    }
    catch (logError) {
        logger_1.logger.error("birthday.push_log.insert_failed", { error: logError.message, userXh });
    }
};
const generateCard = async (xm, csrq) => {
    await (0, promises_1.mkdir)(CARD_OUTPUT_DIR, { recursive: true });
    const outputPath = (0, node_path_1.join)(CARD_OUTPUT_DIR, `${(0, node_crypto_1.randomUUID)()}.png`);
    const now = new Date();
    const month = (now.getMonth() + 1).toString();
    const templatePath = (0, node_path_1.join)(__dirname, "..", "image", `${month}.psd`);
    const inputJson = JSON.stringify({ xm, csrq, template: templatePath, output: outputPath });
    await spawnPython((0, node_path_1.join)(__dirname, "..", "scripts", "gen_birthday_card.py"), inputJson);
    return outputPath;
};
exports.generateCard = generateCard;
const runBirthdayPush = async () => {
    const toggleCheck = await (0, db_1.query)("SELECT push_enabled FROM birthday_config LIMIT 1");
    if (toggleCheck.rows[0]?.push_enabled === false) {
        logger_1.logger.info("birthday.job.push_disabled", { skip: true });
        return { total: 0, sent: 0, failed: 0 };
    }
    const users = await getBirthdayUsers();
    logger_1.logger.info("birthday.job.users_found", { count: users.length });
    if (users.length === 0) {
        return { total: 0, sent: 0, failed: 0 };
    }
    const blessingTemplate = await getBlessingTemplate();
    let sent = 0;
    let failed = 0;
    for (const user of users) {
        try {
            const cardPath = await (0, exports.generateCard)(user.xm, user.csrq);
            const mediaId = await client_1.wecomClient.uploadImage(cardPath);
            const targetUserId = env_1.env.birthdayPushMode === "production" ? user.xh : TEST_USER_ID;
            // Send blessing text + card image
            const blessingText = blessingTemplate.replace("{name}", user.xm);
            await client_1.wecomClient.sendTextMessage({ touser: targetUserId, content: blessingText });
            await client_1.wecomClient.sendImageMessage({ touser: targetUserId, mediaId });
            if (env_1.env.birthdayPushMode !== "production") {
                logger_1.logger.info("birthday.job.test_mode", {
                    realUser: user.xm,
                    realXh: user.xh,
                    sendTo: TEST_USER_ID,
                });
            }
            // Log success
            await insertPushLog(user.xh, user.xm, user.csrq, cardPath, blessingText, "success", [targetUserId]);
            sent++;
        }
        catch (error) {
            logger_1.logger.error("birthday.job.user_failed", {
                xh: user.xh,
                xm: user.xm,
                error: error.message,
            });
            // Log failure
            await insertPushLog(user.xh, user.xm, user.csrq, null, null, "failed", [], error.message);
            failed++;
        }
    }
    logger_1.logger.info("birthday.job.finish", {
        mode: env_1.env.birthdayPushMode,
        total: users.length,
        sent,
        failed,
    });
    return { total: users.length, sent, failed };
};
exports.runBirthdayPush = runBirthdayPush;
const initBirthdayJob = () => {
    node_cron_1.default.schedule("0 10 * * *", async () => {
        logger_1.logger.info("birthday.job.start", { mode: env_1.env.birthdayPushMode });
        try {
            const result = await (0, exports.runBirthdayPush)();
            logger_1.logger.info("birthday.job.complete", result);
        }
        catch (error) {
            logger_1.logger.error("birthday.job.error", { error: error.message });
        }
    }, { timezone: "Asia/Shanghai" });
};
exports.initBirthdayJob = initBirthdayJob;
