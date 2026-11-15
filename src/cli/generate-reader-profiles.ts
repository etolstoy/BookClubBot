import prisma from "../lib/prisma.js";
import { getOverallLeaderboard } from "../services/review.service.js";
import { enqueueReaderProfile } from "../services/reader-profile.service.js";

// Uses the application's durable worker; it never starts a second worker process.
try {
  const top = await getOverallLeaderboard(15);
  for (const reviewer of top) {
    await enqueueReaderProfile(BigInt(reviewer.telegramUserId), prisma, 0);
  }
  console.log(`Queued reader profiles for ${top.length} all-time top reviewers.`);
  if (process.argv.includes("--wait")) {
    const ids = top.map(r => BigInt(r.telegramUserId));
    const deadline = Date.now() + 15 * 60_000;
    while (true) {
      const profiles = await prisma.readerProfile.findMany({ where: { telegramUserId: { in: ids } } });
      console.log(JSON.stringify({ ready: profiles.filter(p => p.status === "ready").length,
        failed: profiles.filter(p => p.status === "failed").length, total: ids.length }));
      if (profiles.every(p => p.status === "ready" || p.status === "failed")) {
        if (profiles.some(p => p.status === "failed")) throw new Error("Some reader profiles failed; see worker logs");
        break;
      }
      if (Date.now() >= deadline) throw new Error("Timed out waiting for reader profiles");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Reader profile backfill failed");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
