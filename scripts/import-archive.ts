#!/usr/bin/env node

import { extract } from "./import/extract.js";
import { process as processMessages } from "./import/process.js";
import { reviewExtractions } from "./import/review-extractions.js";
import { autoReview } from "./import/auto-review.js";
import { enrich } from "./import/enrich.js";
import { reviewEnrichments } from "./import/review-enrichments.js";
import { finalize } from "./import/finalize.js";
import { status } from "./import/status.js";

function showUsage() {
  console.log(`
Staged Import System - Usage
=============================

Commands:

  extract --input <path> --chat-id <id>
    Extract messages from Telegram JSON export

  process [--limit <N>] [--auto-confirm-high]
    Run LLM extraction on pending messages

  review-extractions [--filter low|medium|alternatives]
    Interactive CLI to review uncertain extractions

  auto-review [--limit <N>] [--dry-run]
    Automatically review extractions using GPT-4o (Step 2.5)

  enrich [--limit <N>]
    Search Google Books for confirmed extractions

  review-enrichments [--filter multiple|none|quality|all]
    Interactive CLI to select books from Google Books results

  finalize [--dry-run]
    Create Book and Review records from completed enrichments

  status
    Show pipeline status and progress

Examples:

  npm run import -- extract --input tg-export.json --chat-id -123456789
  npm run import -- process --limit 10 --auto-confirm-high
  npm run import -- review-extractions --filter low
  npm run import -- auto-review --limit 10 --dry-run
  npm run import -- enrich
  npm run import -- review-enrichments --filter multiple
  npm run import -- finalize --dry-run
  npm run import -- status
`);
}

// Main command router
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];

  // Helper to get flag value
  function getArgValue(flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  // Helper to check if flag exists
  function hasFlag(flag: string): boolean {
    return args.includes(flag);
  }

  try {
    switch (command) {
      case "extract": {
        const inputFile = getArgValue("--input");
        const chatId = getArgValue("--chat-id");

        if (!inputFile || !chatId) {
          console.error("Error: --input and --chat-id are required for extract command");
          showUsage();
          process.exit(1);
        }

        await extract(inputFile, chatId);
        break;
      }

      case "process": {
        const limitStr = getArgValue("--limit");
        const limit = limitStr ? parseInt(limitStr, 10) : undefined;
        const autoConfirmHigh = hasFlag("--auto-confirm-high");

        await processMessages(limit, autoConfirmHigh);
        break;
      }

      case "review-extractions": {
        const filter = getArgValue("--filter");
        await reviewExtractions(filter);
        break;
      }

      case "auto-review": {
        const limitStr = getArgValue("--limit");
        const limit = limitStr ? parseInt(limitStr, 10) : undefined;
        const dryRun = hasFlag("--dry-run");

        await autoReview(limit, dryRun);
        break;
      }

      case "enrich": {
        const limitStr = getArgValue("--limit");
        const limit = limitStr ? parseInt(limitStr, 10) : undefined;

        await enrich(limit);
        break;
      }

      case "review-enrichments": {
        const filter = getArgValue("--filter");
        await reviewEnrichments(filter);
        break;
      }

      case "finalize": {
        const dryRun = hasFlag("--dry-run");
        await finalize(dryRun);
        break;
      }

      case "status": {
        await status();
        break;
      }

      default: {
        if (!command) {
          console.error("Error: No command specified");
        } else {
          console.error(`Error: Unknown command "${command}"`);
        }
        showUsage();
        process.exit(1);
      }
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
