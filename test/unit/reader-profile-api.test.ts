import {beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
import router from '../../src/api/routes/reviewers.js';
import {getReaderProfile,enqueueReaderProfile} from '../../src/services/reader-profile.service.js';
vi.mock('../../src/services/reader-profile.service.js',()=>({getReaderProfile:vi.fn(),enqueueReaderProfile:vi.fn()}));
vi.mock('../../src/services/review.service.js',()=>({
  getReviewsByUserId:vi.fn(async()=>[{telegramUserId:123n,telegramUsername:'reader',telegramDisplayName:'Reader',id:1,book:null,reviewText:'Review',sentiment:'positive',reviewedAt:new Date(),messageId:null,chatId:null}]),
  getUserReviewStats:vi.fn(async()=>({totalReviews:1,sentimentCounts:{positive:1,neutral:0,negative:0}})),
}));
const app=express();app.use('/reviewers',router);
const profile={text:'Русская прожарка.',status:'ready',generatedAt:new Date('2026-11-15')};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getReaderProfile).mockResolvedValue(profile);});
describe('Reader profile API',()=>{
 it('includes the saved profile on the reviewer page response',async()=>{
  const r=await request(app).get('/reviewers/123');expect(r.status).toBe(200);expect(r.body.reviewer.readerProfile.text).toBe(profile.text);
  expect(r.body.reviewer.readerProfile.generatedAt).toBe('2026-11-15T00:00:00.000Z');expect(enqueueReaderProfile).not.toHaveBeenCalled();
 });
 it('supports inexpensive profile polling without starting generation',async()=>{
  const r=await request(app).get('/reviewers/123/reader-profile');expect(r.status).toBe(200);expect(r.body.readerProfile.text).toBe(profile.text);
  expect(getReaderProfile).toHaveBeenCalledWith(123n);expect(enqueueReaderProfile).not.toHaveBeenCalled();
 });
 it('returns an empty saved profile without scheduling generation',async()=>{
  vi.mocked(getReaderProfile).mockResolvedValue(null);const r=await request(app).get('/reviewers/123/reader-profile');
  expect(r.body.readerProfile).toBeNull();expect(enqueueReaderProfile).not.toHaveBeenCalled();
 });
 it('rejects invalid reviewer IDs',async()=>{expect((await request(app).get('/reviewers/abc/reader-profile')).status).toBe(400);expect(getReaderProfile).not.toHaveBeenCalled();});
});
