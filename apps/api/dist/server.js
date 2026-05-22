"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const push_1 = require("./jobs/push");
const app_1 = require("./app");
const db_1 = require("./lib/db");
const logger_1 = require("./lib/logger");
const start = async () => {
    await (0, db_1.initDb)();
    app_1.app.listen(env_1.env.port, () => {
        (0, push_1.initPushJobs)();
        logger_1.logger.info("server.started", {
            port: env_1.env.port,
            nodeEnv: env_1.env.nodeEnv,
        });
    });
};
start().catch((error) => {
    logger_1.logger.error("server.start.failed", { error });
    process.exit(1);
});
