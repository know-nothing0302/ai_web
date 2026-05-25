import cron from "node-cron";
import { logger } from "../lib/logger";
import { syncOracleUsers } from "../modules/users/routes";

export const initSyncUsersJob = (): void => {
  cron.schedule("0 3 * * *", async () => {
    logger.info("sync.users.job.start");
    try {
      const stats = await syncOracleUsers();
      logger.info("sync.users.job.finish", { stats });
    } catch (error) {
      logger.error("sync.users.job.failed", { error });
    }
  }, { timezone: "Asia/Shanghai" });
};
