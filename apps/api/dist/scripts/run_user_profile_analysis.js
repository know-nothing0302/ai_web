"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_js_1 = require("../lib/db.js");
const profile_service_js_1 = require("../modules/page_agent/profile_service.js");
const run = async () => {
    await (0, db_js_1.initDb)();
    const job = await (0, profile_service_js_1.runUserProfileAnalysisJob)({
        triggerMode: "scheduled",
    });
    process.stdout.write(`${job.id} ${job.status}\n`);
};
void run();
