import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
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
     WHERE TO_CHAR(csrq, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'MM-DD')`
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

      // Send blessing text + card image
      const blessingText = blessingTemplate.replace("{name}", user.xm);
      await wecomClient.sendTextMessage({ touser: targetUserId, content: blessingText });
      await wecomClient.sendImageMessage({ touser: targetUserId, mediaId });

      if (env.birthdayPushMode !== "production") {
        logger.info("birthday.job.test_mode", {
          realUser: user.xm,
          realXh: user.xh,
          sendTo: TEST_USER_ID,
        });
      }

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
