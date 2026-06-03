import { env } from "./config/env";
import { initPushJobs } from "./jobs/push";
import { initSyncUsersJob } from "./jobs/sync-users";
import { initBirthdayJob } from "./jobs/birthday";
import { initProfileAnalysisJob } from "./jobs/profile";
import { app } from "./app";
import { initDb } from "./lib/db";
import { logger } from "./lib/logger";

const start = async (): Promise<void> => {
  await initDb();
  app.listen(env.port, () => {
    initPushJobs();
    initSyncUsersJob();
    initBirthdayJob();
    initProfileAnalysisJob();
    logger.info("server.started", {
      port: env.port,
      nodeEnv: env.nodeEnv,
    });
  });
};

start().catch((error: Error) => {
  logger.error("server.start.failed", { error });
  process.exit(1);
});
