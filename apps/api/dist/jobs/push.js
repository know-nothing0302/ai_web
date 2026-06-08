"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPushJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const logger_1 = require("../lib/logger");
const service_1 = require("../modules/push/service");
const initPushJobs = () => {
    node_cron_1.default.schedule(env_1.env.wecomTagSyncCron, async () => {
        logger_1.logger.info("push.job.tag_sync.start", { cron: env_1.env.wecomTagSyncCron });
        try {
            const syncedCount = await service_1.pushService.syncAllTags();
            logger_1.logger.info("push.job.tag_sync.finish", {
                cron: env_1.env.wecomTagSyncCron,
                syncedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("push.job.tag_sync.failed", {
                cron: env_1.env.wecomTagSyncCron,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
    node_cron_1.default.schedule(env_1.env.deferredInstantPushCron, async () => {
        logger_1.logger.info("push.job.instant.deferred.start", {
            cron: env_1.env.deferredInstantPushCron,
            timezone: env_1.env.pushTimezone,
        });
        try {
            const pushedCount = await service_1.pushService.pushDeferredInstantDigest();
            logger_1.logger.info("push.job.instant.deferred.finish", {
                cron: env_1.env.deferredInstantPushCron,
                timezone: env_1.env.pushTimezone,
                pushedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("push.job.instant.deferred.failed", {
                cron: env_1.env.deferredInstantPushCron,
                timezone: env_1.env.pushTimezone,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
    node_cron_1.default.schedule(env_1.env.dailyPushCron, async () => {
        logger_1.logger.info("push.job.daily.start", { cron: env_1.env.dailyPushCron });
        try {
            const pushedCount = await service_1.pushService.pushDailyDigest();
            logger_1.logger.info("push.job.daily.finish", {
                cron: env_1.env.dailyPushCron,
                pushedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("push.job.daily.failed", {
                cron: env_1.env.dailyPushCron,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
    node_cron_1.default.schedule(env_1.env.dailyPushCron2, async () => {
        logger_1.logger.info("push.job.daily2.start", { cron: env_1.env.dailyPushCron2 });
        try {
            const pushedCount = await service_1.pushService.pushDailyDigest();
            logger_1.logger.info("push.job.daily2.finish", {
                cron: env_1.env.dailyPushCron2,
                pushedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("push.job.daily2.failed", {
                cron: env_1.env.dailyPushCron2,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
    node_cron_1.default.schedule(env_1.env.weeklyPushCron, async () => {
        logger_1.logger.info("push.job.weekly.start", {
            cron: env_1.env.weeklyPushCron,
            timezone: env_1.env.pushTimezone,
        });
        try {
            const pushedCount = await service_1.pushService.pushWeeklyDigest();
            logger_1.logger.info("push.job.weekly.finish", {
                cron: env_1.env.weeklyPushCron,
                timezone: env_1.env.pushTimezone,
                pushedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("push.job.weekly.failed", {
                cron: env_1.env.weeklyPushCron,
                timezone: env_1.env.pushTimezone,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
};
exports.initPushJobs = initPushJobs;
