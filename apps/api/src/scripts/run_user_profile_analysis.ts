import { initDb } from "../lib/db.js";
import { runUserProfileAnalysisJob } from "../modules/page_agent/profile_service.js";

const run = async (): Promise<void> => {
  await initDb();
  const job = await runUserProfileAnalysisJob({
    triggerMode: "scheduled",
  });
  process.stdout.write(`${job.id} ${job.status}\n`);
};

void run();
