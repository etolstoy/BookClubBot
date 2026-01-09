import { createBot, startBot } from "./bot/index.js";
import { createServer, startServer } from "./server.js";

async function main() {
  console.log("Book Club Bot starting...");

  // Create and start API server
  const server = createServer();
  await startServer(server);

  // Create and start bot
  const bot = createBot();
  await startBot(bot);

  console.log("All services started successfully!");
}

main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
