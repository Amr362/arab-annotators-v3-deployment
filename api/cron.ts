import { VercelRequest, VercelResponse } from '@vercel/node';
import { recomputeMetrics } from "../server/workers/statsWorker";
import { runIAAForAllProjects } from "../server/workers/iaaWorker";
import { expireOverdueTasks } from "../server/workers/stateMachine";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Check for Vercel Cron Secret to ensure only Vercel can call this
  const authHeader = request.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ success: false, message: 'Unauthorized' });
  }

  console.log("[Cron] Running scheduled workers...");

  try {
    // Run each worker's main logic once
    await Promise.all([
        recomputeMetrics(),
        runIAAForAllProjects(),
        expireOverdueTasks()
    ]);

    response.status(200).json({ success: true, message: 'Workers executed successfully' });
  } catch (error: any) {
    console.error("[Cron] Error running workers:", error.message);
    response.status(500).json({ success: false, error: error.message });
  }
}
