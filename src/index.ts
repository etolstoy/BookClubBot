import fs from "fs";
import path from "path";
import { createBot, startBot } from "./bot/index.js";
import { createServer, startServer } from "./server.js";
import { sendErrorNotification } from "./services/notification.service.js";
import { config } from "./lib/config.js";

async function validateEvalCaseLogging(): Promise<void> {
  try {
    const testDir = path.join(
      process.cwd(),
      "data",
      "review-eval-cases",
      config.extractionVersion
    );

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, ".writetest");
    fs.writeFileSync(testFile, "test", "utf-8");
    fs.unlinkSync(testFile);

    console.log(`[Startup] Eval case logging directory is writable (version: ${config.extractionVersion})`);
  } catch (error) {
    console.warn("[Startup] WARNING: Eval case logging directory not writable:", error);
    console.warn("[Startup] Review processing will continue, but eval cases won't be logged");
  }
}

async function main() {
  // Increase max listeners for development mode (tsx watch creates multiple listeners)
  if (config.isDev) {
    process.setMaxListeners(20);
  }

  console.log("Book Club Bot starting...");

  // Initialize required directories
  const logDir = "data/google-books-failures";
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    console.log(`Created log directory: ${logDir}`);
  }

  // Validate eval case logging directory
  await validateEvalCaseLogging();

  // Create bot first (needed for notifications and server)
  const bot = createBot();

  // Create and start API server (pass bot for auth middleware)
  const server = createServer(bot);
  await startServer(server);

  // Start bot (this will initialize notification service)
  await startBot(bot);

  console.log("All services started successfully!");
}

main().catch(async (error) => {
  console.error("Failed to start application:", error);

  // Try to send error notification before exit
  if (error instanceof Error) {
    try {
      await sendErrorNotification(error, {
        operation: "Application Startup",
        additionalInfo: "Critical: Application failed to start",
      });
    } catch (notifError) {
      console.error("Failed to send startup error notification:", notifError);
    }
  }

  process.exit(1);
});
