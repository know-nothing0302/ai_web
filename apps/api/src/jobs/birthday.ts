import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import cron from "node-cron";
import { env } from "../config/env";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { wecomClient } from "../modules/wecom/client";

const CARD_OUTPUT_DIR = "/tmp/birthday-cards";

const spawnPython = (scriptPath: string, input: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath]);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("python3 timeout after 30s"));
    }, 30_000);

    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("exit", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`python3 exit ${code}: stdout=${stdout.trim()} stderr=${stderr.trim()}`));
    });
    child.stdin!.write(input);
    child.stdin!.end();
  });

interface BirthdayUser {
  xh: string;
  xm: string;
  csrq: string;
}

const TEST_USER_ID = "100002013029";

const getBirthdayUsers = async (): Promise<BirthdayUser[]> => {
  const result = await query<BirthdayUser>(
    `SELECT xh, xm, TO_CHAR(csrq, 'YYYY-MM-DD') AS csrq
     FROM users
     WHERE (
       TO_CHAR(csrq, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD')
       OR (
         -- 非闰年2月28日，同时推送2月29日出生者
         TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD') = '02-28'
         AND TO_CHAR(csrq, 'MM-DD') = '02-29'
         AND EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Asia/Shanghai') % 4 != 0
       )
     )`
  );
  return result.rows;
};

const getBlessingTemplate = async (): Promise<string> => {
  try {
    const result = await query<{ blessing_template: string }>(
      "SELECT blessing_template FROM birthday_config LIMIT 1"
    );
    return result.rows[0]?.blessing_template ?? "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
  } catch {
    return "亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！";
  }
};

const insertPushLog = async (
  userXh: string,
  xm: string,
  csrq: string,
  cardPath: string | null,
  blessingText: string | null,
  status: "success" | "failed",
  pushedTo: string[],
  errorMessage?: string
): Promise<void> => {
  try {
    await query(
      `INSERT INTO birthday_push_log (user_xh, xm, csrq, card_path, blessing_text, status, pushed_to, error_message)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)`,
      [userXh, xm, csrq, cardPath, blessingText, status, pushedTo, errorMessage ?? null]
    );
  } catch (logError: any) {
    logger.error("birthday.push_log.insert_failed", { error: logError.message, userXh });
  }
};

export const generateCard = async (xm: string, csrq: string): Promise<string> => {
  await mkdir(CARD_OUTPUT_DIR, { recursive: true });
  const outputPath = join(CARD_OUTPUT_DIR, `${randomUUID()}.png`);

  const now = new Date();
  const month = (now.getMonth() + 1).toString();
  const templatePath = join(__dirname, "..", "image", `${month}.psd`);

  const inputJson = JSON.stringify({ xm, csrq, template: templatePath, output: outputPath });
  await spawnPython(join(__dirname, "..", "scripts", "gen_birthday_card.py"), inputJson);

  return outputPath;
};

export const runBirthdayPush = async (): Promise<{ total: number; sent: number; failed: number }> => {
  // 检查 users 表同步是否新鲜
  const syncCheck = await query<{ synced_at: string }>(
    "SELECT MAX(synced_at) AS synced_at FROM users WHERE synced_at IS NOT NULL"
  );
  const lastSync = syncCheck.rows[0]?.synced_at;
  if (!lastSync || new Date(lastSync).toDateString() !== new Date().toDateString()) {
    logger.warn("birthday.job.stale_sync", { lastSync, action: "skipping push — users table not synced today" });
    return { total: 0, sent: 0, failed: 0 };
  }

  // 检查今日是否已执行
  const todayCheck = await query<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM birthday_push_log WHERE pushed_at::date = CURRENT_DATE AND status = 'success'"
  );
  if (parseInt(todayCheck.rows[0]?.cnt ?? "0") > 0) {
    logger.info("birthday.job.already_executed_today", { skip: true });
    return { total: 0, sent: 0, failed: 0 };
  }

  // 清理上次残留的卡片文件
  await rm(CARD_OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(CARD_OUTPUT_DIR, { recursive: true });

  const users = await getBirthdayUsers();
  logger.info("birthday.job.users_found", { count: users.length });

  if (users.length === 0) {
    return { total: 0, sent: 0, failed: 0 };
  }

  const blessingTemplate = await getBlessingTemplate();

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const cardPath = await generateCard(user.xm, user.csrq);
      const mediaId = await wecomClient.uploadImage(cardPath);

      const targetUserId =
        env.birthdayPushMode === "production" ? user.xh : TEST_USER_ID;

      const blessingText = blessingTemplate.replace("{name}", user.xm);

      // 先发图片（核心），再发文字
      const imgResult = await wecomClient.sendImageMessage({ touser: targetUserId, mediaId });
      const textResult = await wecomClient.sendTextMessage({ touser: targetUserId, content: blessingText });

      const invalidUsers = [
        ...(textResult.invalidUserIds ?? []),
        ...(imgResult.invalidUserIds ?? []),
      ];

      if (invalidUsers.length > 0) {
        logger.warn("birthday.job.invalid_users", { xh: user.xh, invalidUsers });
      }

      if (env.birthdayPushMode !== "production") {
        logger.info("birthday.job.test_mode", {
          realUser: user.xm,
          realXh: user.xh,
          sendTo: TEST_USER_ID,
        });
      }

      // 成功后删临时文件
      await unlink(cardPath);

      // Log success
      await insertPushLog(user.xh, user.xm, user.csrq, cardPath, blessingText, "success", [targetUserId]);

      sent++;
    } catch (error: any) {
      logger.error("birthday.job.user_failed", {
        xh: user.xh,
        xm: user.xm,
        error: error.message,
      });

      // Log failure
      await insertPushLog(
        user.xh,
        user.xm,
        user.csrq,
        null,
        null,
        "failed",
        [],
        error.message
      );

      failed++;
    }
  }

  logger.info("birthday.job.finish", {
    mode: env.birthdayPushMode,
    total: users.length,
    sent,
    failed,
  });

  return { total: users.length, sent, failed };
};

export const initBirthdayJob = (): void => {
  cron.schedule(
    "0 8 * * *",
    async () => {
      logger.info("birthday.job.start", { mode: env.birthdayPushMode });
      try {
        const result = await runBirthdayPush();
        logger.info("birthday.job.complete", result);
      } catch (error: any) {
        logger.error("birthday.job.error", { error: error.message });
      }
    },
    { timezone: "Asia/Shanghai" }
  );
};
