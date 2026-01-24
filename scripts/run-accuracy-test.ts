#!/usr/bin/env npx tsx
/**
 * Runner script for book extraction accuracy tests
 * Suppresses vitest framework output, shows only the accuracy report
 */

import { spawn } from "child_process";

const child = spawn(
  "npx",
  ["vitest", "run", "test/integration/book-extraction-accuracy.test.ts", "--reporter=dot"],
  {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: process.cwd(),
  }
);

let output = "";

child.stdout.on("data", (data) => {
  output += data.toString();
});

child.stderr.on("data", (data) => {
  output += data.toString();
});

child.on("close", () => {
  // Extract only the accuracy report (from first === line to last === line)
  const lines = output.split("\n");
  const startIdx = lines.findIndex((l) => l.includes("BOOK EXTRACTION ACCURACY REPORT"));
  const endIdx = lines.findLastIndex((l) => l.match(/^={50,}$/));

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Include the === line before the title and after the report
    const reportLines = lines.slice(startIdx - 1, endIdx + 1);
    console.log("\n" + reportLines.join("\n") + "\n");
  } else {
    // Fallback: show everything if no report found
    console.log(output);
  }
});
