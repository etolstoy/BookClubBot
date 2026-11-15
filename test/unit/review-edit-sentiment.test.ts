import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import router from "../../src/api/routes/reviews.js";
import { analyzeSentiment } from "../../src/services/sentiment.js";
import { getReviewById, updateReview, isReviewOwner } from "../../src/services/review.service.js";

vi.mock("../../src/services/review.service.js", () => ({
  getRandomReviews:vi.fn(),getRecentReviews:vi.fn(),updateReview:vi.fn(),deleteReview:vi.fn(),
  isReviewOwner:vi.fn(),isAdmin:vi.fn(()=>false),isChatMember:vi.fn(()=>false),
  getReviewById:vi.fn(),cleanupOrphanBooks:vi.fn(),
}));
vi.mock("../../src/api/middleware/telegram-auth.js", () => ({
  authenticateTelegramWebApp:(req:any,_res:any,next:any)=>{req.telegramUser={id:1n};next();},
}));
vi.mock("../../src/services/notification.service.js",()=>({sendInfoNotification:vi.fn()}));
vi.mock("../../src/services/sentiment.js",()=>({analyzeSentiment:vi.fn()}));
vi.mock("../../src/services/book.service.js",()=>({findOrCreateBookFromExternalMetadata:vi.fn()}));
const original={id:1,bookId:null,book:null,telegramUserId:1n,telegramUsername:'test',telegramDisplayName:'Test',
  reviewText:'Great book.',sentiment:'positive',reviewedAt:new Date(),messageId:null,chatId:null};

describe("Sentiment when editing review text",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.mocked(getReviewById).mockResolvedValue(original as any);
    vi.mocked(isReviewOwner).mockResolvedValue(true);
    vi.mocked(analyzeSentiment).mockResolvedValue(null);
    vi.mocked(updateReview).mockImplementation(async(_id,data)=>({...original,...data}) as any);
  });
  const app=express();app.use(express.json());app.use('/reviews',router);
  it("clears a stale label when the changed text has no evaluative evidence",async()=>{
    const r=await request(app).patch('/reviews/1').send({reviewText:'A description of the plot.'});
    expect(r.status).toBe(200);expect(r.body.review.sentiment).toBeNull();
    expect(updateReview).toHaveBeenCalledWith(1,{reviewText:'A description of the plot.',sentiment:null});
  });
  it("preserves an explicit human label instead of calling Jev",async()=>{
    const r=await request(app).patch('/reviews/1').send({reviewText:'An edited review.',sentiment:'neutral'});
    expect(r.status).toBe(200);expect(r.body.review.sentiment).toBe('neutral');
    expect(analyzeSentiment).not.toHaveBeenCalled();
  });
});
