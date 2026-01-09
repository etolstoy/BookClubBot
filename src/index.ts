import { createBot, startBot } from "./bot/index.js";
import { createServer, startServer } from "./server.js";
import { sendErrorNotification } from "./services/notification.service.js";

async function main() {
  console.log("Book Club Bot starting...");

  // Create bot first (needed for notifications)
  const bot = createBot();

  // Create and start API server
  const server = createServer();
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
