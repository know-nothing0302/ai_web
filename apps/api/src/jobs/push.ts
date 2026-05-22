import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { pushService } from "../modules/push/service";

export const initPushJobs = (): void => {
  cron.schedule(env.wecomTagSyncCron, async () => {
    logger.info("push.job.tag_sync.start", { cron: env.wecomTagSyncCron });
    try {
      const syncedCount = await pushService.syncAllTags();
      logger.info("push.job.tag_sync.finish", {
        cron: env.wecomTagSyncCron,
        syncedCount,
      });
    } catch (error) {
      logger.error("push.job.tag_sync.failed", {
        cron: env.wecomTagSyncCron,
        error,
      });
    }
  }, { timezone: env.pushTimezone });
  cron.schedule(env.deferredInstantPushCron, async () => {
    logger.info("push.job.instant.deferred.start", {
      cron: env.deferredInstantPushCron,
      timezone: env.pushTimezone,
    });
    try {
      const pushedCount = await pushService.pushDeferredInstantDigest();
      logger.info("push.job.instant.deferred.finish", {
        cron: env.deferredInstantPushCron,
        timezone: env.pushTimezone,
        pushedCount,
      });
    } catch (error) {
      logger.error("push.job.instant.deferred.failed", {
        cron: env.deferredInstantPushCron,
        timezone: env.pushTimezone,
        error,
      });
    }
  }, { timezone: env.pushTimezone });
  cron.schedule(env.dailyPushCron, async () => {
    logger.info("push.job.daily.start", { cron: env.dailyPushCron });
    try {
      const pushedCount = await pushService.pushDailyDigest();
      logger.info("push.job.daily.finish", {
        cron: env.dailyPushCron,
        pushedCount,
      });
    } catch (error) {
      logger.error("push.job.daily.failed", {
        cron: env.dailyPushCron,
        error,
      });
    }
  }, { timezone: env.pushTimezone });
  cron.schedule(env.weeklyPushCron, async () => {
    logger.info("push.job.weekly.start", {
      cron: env.weeklyPushCron,
      timezone: env.pushTimezone,
    });
    try {
      const pushedCount = await pushService.pushWeeklyDigest();
      logger.info("push.job.weekly.finish", {
        cron: env.weeklyPushCron,
        timezone: env.pushTimezone,
        pushedCount,
      });
    } catch (error) {
      logger.error("push.job.weekly.failed", {
        cron: env.weeklyPushCron,
        timezone: env.pushTimezone,
        error,
      });
    }
  }, { timezone: env.pushTimezone });
};
