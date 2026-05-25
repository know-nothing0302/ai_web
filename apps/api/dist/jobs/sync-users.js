"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSyncUsersJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../lib/logger");
const routes_1 = require("../modules/users/routes");
const initSyncUsersJob = () => {
    node_cron_1.default.schedule("0 3 * * *", async () => {
        logger_1.logger.info("sync.users.job.start");
        try {
            const stats = await (0, routes_1.syncOracleUsers)();
            logger_1.logger.info("sync.users.job.finish", { stats });
        }
        catch (error) {
            logger_1.logger.error("sync.users.job.failed", { error });
        }
    }, { timezone: "Asia/Shanghai" });
};
exports.initSyncUsersJob = initSyncUsersJob;
