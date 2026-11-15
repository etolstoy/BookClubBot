import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enqueueReaderProfile, getReaderProfile, processNextReaderProfile, startReaderProfileWorker } from '../../src/services/reader-profile.service.js';
import type { ProfileReview } from '../../src/clients/llm/reader-profile-client.js';
let db: PrismaClient, directory: string;
const generated={text:'Ты читаешь так, будто это соревнование с книжным шкафом.',inputTokens:120,outputTokens:40};
async function review(user=123n,text='Full review',date=new Date('2026-11-15T00:00:00Z')){
  return db.review.create({data:{telegramUserId:user,reviewText:text,reviewedAt:date,book:{create:{title:'A book',author:'An author'}}}});
}
async function enqueue(user=123n){return enqueueReaderProfile(user,db,0);}
beforeAll(()=>{
  directory=mkdtempSync(path.join(tmpdir(),'reader-profile-'));const url=`file:${directory}/test.db`;
  execFileSync(path.resolve('node_modules/.bin/prisma'),['migrate','deploy'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
  db=new PrismaClient({datasources:{db:{url}}});
});
beforeEach(async()=>{await db.readerProfile.deleteMany();await db.review.deleteMany();await db.book.deleteMany();});
afterAll(async()=>{await db.$disconnect();rmSync(directory,{recursive:true,force:true});});

describe('durable reader profile generation',()=>{
  it('uses the latest twenty full reviews for exactly one user and includes book metadata',async()=>{
    for(let i=0;i<25;i++)await review(123n,`Full review ${i}`,new Date(2026,0,i+1));
    await review(999n,'Other member private evidence');await enqueue();
    const generate=vi.fn(async(reviews:ProfileReview[])=>generated);
    await processNextReaderProfile(db,generate);
    const context=generate.mock.calls[0][0];expect(context).toHaveLength(20);
    expect(context[0].reviewText).toBe('Full review 24');expect(context.at(-1)?.reviewText).toBe('Full review 5');
    expect(context.every(r=>r.title==='A book'&&r.author==='An author')).toBe(true);
    const saved=(await db.readerProfile.findUnique({where:{telegramUserId:123n}}))!;
    expect(saved.status).toBe('ready');expect(saved.model).toBe('gpt-6.1-terra');expect(saved.reasoningEffort).toBe('high');
    expect(saved.latestReviewId).toBe(context[0].id);expect(JSON.parse(saved.sourceReviewIds)).toEqual(context.map(r=>r.id));
  });
  it('breaks timestamp ties by newest review ID and keeps reviews with unmatched books',async()=>{
    await review();const latest=await db.review.create({data:{telegramUserId:123n,reviewText:'Latest unmatched book',reviewedAt:new Date('2026-11-15T00:00:00Z')}});
    await enqueue();const generate=vi.fn(async(reviews:ProfileReview[])=>generated);await processNextReaderProfile(db,generate);
    expect(generate.mock.calls[0][0][0]).toMatchObject({id:latest.id,title:null,reviewText:'Latest unmatched book'});
  });
  it('coalesces queued requests and skips an unchanged source without another API call',async()=>{
    await review();await enqueue();await enqueue();const generate=vi.fn(async()=>generated);
    await processNextReaderProfile(db,generate);expect(await processNextReaderProfile(db,generate)).toBe(false);
    await enqueue();await processNextReaderProfile(db,generate);expect(generate).toHaveBeenCalledTimes(1);
  });
  it('passes the current member name and regenerates when that name changes',async()=>{
    const r=await review();
    await db.review.update({where:{id:r.id},data:{telegramDisplayName:'Алексей Иванов',telegramUsername:'alex'}});
    const generate=vi.fn(async(reviews:ProfileReview[],name:string)=>generated);
    await enqueue();await processNextReaderProfile(db,generate);
    expect(generate.mock.calls[0][1]).toBe('Алексей Иванов');
    const before=(await db.readerProfile.findUnique({where:{telegramUserId:123n}}))!.sourceHash;
    await db.review.update({where:{id:r.id},data:{telegramDisplayName:'Александр'}});
    await enqueue();await processNextReaderProfile(db,generate);
    expect(generate).toHaveBeenCalledTimes(2);expect(generate.mock.calls[1][1]).toBe('Александр');
    expect((await db.readerProfile.findUnique({where:{telegramUserId:123n}}))!.sourceHash).not.toBe(before);
  });
  it('uses the username when the display name is missing',async()=>{
    const r=await review();await db.review.update({where:{id:r.id},data:{telegramDisplayName:' ',telegramUsername:'alex'}});
    const generate=vi.fn(async(reviews:ProfileReview[],name:string)=>generated);
    await enqueue();await processNextReaderProfile(db,generate);expect(generate.mock.calls[0][1]).toBe('alex');
  });
  it('discards an older generation when a new review arrives during the API call',async()=>{
    await review();await enqueue();let finish!:(v:typeof generated)=>void;let started!:()=>void;
    const began=new Promise<void>(r=>{started=r;});const pending=new Promise<typeof generated>(r=>{finish=r;});
    const older=processNextReaderProfile(db,async()=>{started();return pending;});await began;
    const latest=await review(123n,'New review',new Date('2026-11-16T00:00:00Z'));await enqueue();
    finish({...generated,text:'Old generation'});await older;
    expect((await getReaderProfile(123n,db))?.text).toBeNull();
    const generate=vi.fn(async(reviews:ProfileReview[])=>({...generated,text:'Newest generation'}));
    await processNextReaderProfile(db,generate);
    expect(generate.mock.calls[0][0][0].id).toBe(latest.id);expect((await getReaderProfile(123n,db))?.text).toBe('Newest generation');
  });
  it('keeps the previous profile and retries safely after a generation failure',async()=>{
    await review();await enqueue();await processNextReaderProfile(db,async()=>generated);
    await review(123n,'New evidence',new Date('2026-11-16'));await enqueue();
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{
      await processNextReaderProfile(db,async()=>{throw new Error('provider-secret');});
      const saved=(await db.readerProfile.findUnique({where:{telegramUserId:123n}}))!;
      expect(saved.text).toBe(generated.text);expect(saved.status).toBe('pending');expect(saved.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      expect(JSON.stringify(log.mock.calls)).not.toContain('provider-secret');
    }finally{log.mockRestore();}
  });
  it('marks the third failed attempt as failed instead of retrying forever',async()=>{
    await review();await enqueue();await db.readerProfile.update({where:{telegramUserId:123n},data:{attempts:2}});
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try{await processNextReaderProfile(db,async()=>{throw Error('failure');});}finally{log.mockRestore();}
    expect((await getReaderProfile(123n,db))?.status).toBe('failed');
  });
  it('clears the profile when no review evidence remains',async()=>{
    await review();await enqueue();await processNextReaderProfile(db,async()=>generated);
    await db.review.deleteMany();await enqueue();const generate=vi.fn();await processNextReaderProfile(db,generate);
    expect(generate).not.toHaveBeenCalled();expect((await getReaderProfile(123n,db))?.text).toBeNull();
  });
  it('recovers interrupted work after a worker restart',async()=>{
    await review();await enqueue();await db.readerProfile.update({where:{telegramUserId:123n},data:{status:'generating'}});
    const generate=vi.fn(async()=>generated);const stop=await startReaderProfileWorker(db,generate);
    try{
      for(let i=0;i<100;i++){
        if((await getReaderProfile(123n,db))?.status==='ready')break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect((await getReaderProfile(123n,db))?.status).toBe('ready');expect(generate).toHaveBeenCalledTimes(1);
    }finally{await stop();}
  });
  it('exposes only display fields and never creates work on a read',async()=>{
    expect(await getReaderProfile(123n,db)).toBeNull();expect(await db.readerProfile.count()).toBe(0);
    await enqueue();expect(Object.keys((await getReaderProfile(123n,db))!).sort()).toEqual(['generatedAt','status','text']);
  });
  it('generates two users concurrently without duplicate requests for one user',async()=>{
    await review(123n);await review(456n);await enqueue(123n);await enqueue(456n);
    let finish!:(value:typeof generated)=>void;
    const pending=new Promise<typeof generated>(resolve=>{finish=resolve;});
    const generate=vi.fn(async(reviews:ProfileReview[])=>pending);
    const stop=await startReaderProfileWorker(db,generate);
    try{
      await vi.waitFor(()=>expect(generate).toHaveBeenCalledTimes(2),{timeout:2000});
      expect(new Set(generate.mock.calls.map(([reviews])=>reviews[0].id)).size).toBe(2);
    }finally{
      finish(generated);
      await vi.waitFor(async()=>expect(await db.readerProfile.count({where:{status:'ready'}})).toBe(2),{timeout:2000});
      await stop();
    }
  });
});
