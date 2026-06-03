import cron from "node-cron";

import { env } from "../config/env";
import { logger } from "../lib/logger";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service";

export const initProfileAnalysisJob = (): void => {
  cron.schedule(
    env.profileAnalysisCron,
    async () => {
      logger.info("profile.analysis.job.start", {
        cron: env.profileAnalysisCron,
        timezone: env.pushTimezone,
      });
      try {
        const job = await runUserProfileAnalysisJob({
          triggerMode: "scheduled",
        });
        logger.info("profile.analysis.job.finish", {
          jobId: job.id,
          status: job.status,
          processedCount: job.processedCount,
          successCount: job.successCount,
          failedCount: job.failedCount,
        });
      } catch (error) {
        logger.error("profile.analysis.job.failed", {
          cron: env.profileAnalysisCron,
          error,
        });
      }
    },
    { timezone: env.pushTimezone }
  );
};
