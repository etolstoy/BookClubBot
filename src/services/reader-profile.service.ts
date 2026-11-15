import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { ReaderProfileClient, READER_PROFILE_MODEL, READER_PROFILE_REASONING, READER_PROFILE_PROMPT,
  type ProfileReview, type GeneratedReaderProfile } from "../clients/llm/reader-profile-client.js";

type ProfileStore = Pick<PrismaClient, "readerProfile">;
type Generate = (reviews: ProfileReview[]) => Promise<GeneratedReaderProfile>;

export async function enqueueReaderProfile(userId: bigint, db: ProfileStore = prisma, delayMs = 5000) {
  const requestedAt = new Date();
  const nextAttemptAt = new Date(requestedAt.getTime() + delayMs);
  await db.readerProfile.upsert({
    where: { telegramUserId: userId },
    create: { telegramUserId: userId, requestedAt, nextAttemptAt },
    update: { status: "pending", version: { increment: 1 }, attempts: 0, requestedAt, nextAttemptAt },
  });
}

export async function getReaderProfile(userId: bigint, db: ProfileStore = prisma) {
  return db.readerProfile.findUnique({ where: { telegramUserId: userId },
    select: { text: true, status: true, generatedAt: true } });
}

async function latestReviews(userId: bigint, db: Pick<PrismaClient, "review">): Promise<ProfileReview[]> {
  const rows = await db.review.findMany({ where: { telegramUserId: userId },
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }], take: 20,
    select: { id: true, reviewText: true, reviewedAt: true, book: { select: { title: true, author: true } } },
  });
  return rows.map(r => ({ id: r.id, title: r.book?.title ?? null, author: r.book?.author ?? null,
    reviewText: r.reviewText, reviewedAt: r.reviewedAt.toISOString() }));
}

function sourceHash(reviews: ProfileReview[]) {
  return createHash("sha256").update(JSON.stringify({ model: READER_PROFILE_MODEL,
    reasoning: READER_PROFILE_REASONING, prompt: READER_PROFILE_PROMPT, reviews })).digest("hex");
}

/** Claim and process one durable job. Version checks prevent older work overwriting a new review. */
export async function processNextReaderProfile(
  db: PrismaClient = prisma,
  generate: Generate = reviews => new ReaderProfileClient(config.openaiApiKey).generate(reviews),
): Promise<boolean> {
  const job = await db.readerProfile.findFirst({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { requestedAt: "asc" },
  });
  if (!job) return false;
  const guard = { telegramUserId: job.telegramUserId, version: job.version, status: "generating" };
  const claimed = await db.readerProfile.updateMany({
    where: { ...guard, status: "pending" }, data: { status: "generating", attempts: { increment: 1 } },
  });
  // Another worker won this row; keep looking for a different pending user.
  if (!claimed.count) return true;
  try {
    const reviews = await latestReviews(job.telegramUserId, db);
    const hash = sourceHash(reviews);
    const generated = !reviews.length ? { text: null, inputTokens: 0, outputTokens: 0 }
      : job.text && job.sourceHash === hash ? null : await generate(reviews);
    await db.$transaction(async tx => {
      const current = await tx.readerProfile.findUnique({ where: { telegramUserId: job.telegramUserId },
        select: { version: true, status: true } });
      if (current?.version !== job.version || current.status !== "generating") return;
      // Review edits/deletions or book metadata may have changed while the request was in flight.
      if (sourceHash(await latestReviews(job.telegramUserId, tx)) !== hash) {
        await enqueueReaderProfile(job.telegramUserId, tx);
        return;
      }
      await tx.readerProfile.updateMany({ where: guard, data: {
        status: "ready", sourceHash: hash, sourceReviewIds: JSON.stringify(reviews.map(r => r.id)),
        latestReviewId: reviews[0]?.id ?? null,
        ...(generated ? { text: generated.text, generatedAt: new Date(),
          model: READER_PROFILE_MODEL, reasoningEffort: READER_PROFILE_REASONING,
          inputTokens: generated.inputTokens, outputTokens: generated.outputTokens } : {}),
      } });
    });
    console.log(`[ReaderProfile] Processed user ${job.telegramUserId}`);
  } catch {
    const retry = job.attempts + 1 < 3;
    await db.readerProfile.updateMany({ where: guard, data: { status: retry ? "pending" : "failed",
      nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** job.attempts) } });
    // Provider errors can contain request details: keep review text and API credentials out of logs.
    console.error(`[ReaderProfile] Generation failed for user ${job.telegramUserId}; ${retry ? "retry scheduled" : "attempts exhausted"}`);
  }
  return true;
}

export async function startReaderProfileWorker(db: PrismaClient = prisma, generate?: Generate) {
  // There is one application process; recover jobs interrupted by a container restart.
  await db.readerProfile.updateMany({ where: { status: "generating" },
    data: { status: "pending", nextAttemptAt: new Date() } });
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      try {
        const drain = async () => {
          while (!stopped && await processNextReaderProfile(db, generate)) { /* continue until empty */ }
        };
        await Promise.all([drain(), drain()]);
      } catch {
        console.error("[ReaderProfile] Worker unavailable; will retry");
      }
    })().finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
