"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initProfileAnalysisJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const logger_1 = require("../lib/logger");
const profile_service_1 = require("../modules/page_agent/profile_service");
const initProfileAnalysisJob = () => {
    node_cron_1.default.schedule(env_1.env.profileAnalysisCron, async () => {
        logger_1.logger.info("profile.analysis.job.start", {
            cron: env_1.env.profileAnalysisCron,
            timezone: env_1.env.pushTimezone,
        });
        try {
            const job = await (0, profile_service_1.runUserProfileAnalysisJob)({
                triggerMode: "scheduled",
            });
            logger_1.logger.info("profile.analysis.job.finish", {
                jobId: job.id,
                status: job.status,
                processedCount: job.processedCount,
                successCount: job.successCount,
                failedCount: job.failedCount,
            });
        }
        catch (error) {
            logger_1.logger.error("profile.analysis.job.failed", {
                cron: env_1.env.profileAnalysisCron,
                error,
            });
        }
    }, { timezone: env_1.env.pushTimezone });
};
exports.initProfileAnalysisJob = initProfileAnalysisJob;
