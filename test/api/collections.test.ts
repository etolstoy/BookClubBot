import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCollectionsRouter } from '../../src/api/routes/collections.js';
import { getCollections, getCollection, getBookCollections, getCorrectedCollectionAuthor, linkCollectionBooks } from '../../src/services/collection.service.js';
import collectionData from '../../scripts/data/book-collections-seed.json' with {type:'json'};
import { validCatalogISBN } from '../../src/services/book-catalog.service.js';
import { calculateCollectionScore } from '../../src/lib/collection-ranking.js';

let directory:string;
let baseline:string;
let db:PrismaClient;
let dbFile:string;
let app:express.Express;
let queries:string[];
const migrate=(file:string)=>execFileSync(path.resolve('node_modules/.bin/prisma'),['migrate','deploy'],{
  env:{...process.env,DATABASE_URL:`file:${file}`},stdio:'pipe',
});

beforeAll(()=>{
  directory=mkdtempSync(path.join(tmpdir(),'bookclub-collections-'));
  baseline=path.join(directory,'baseline.db');
  migrate(baseline);
});
beforeEach(()=>{
  dbFile=path.join(directory,randomUUID()+'.db');
  copyFileSync(baseline,dbFile);
  queries=[];
  const client=new PrismaClient({datasources:{db:{url:`file:${dbFile}`}},log:[{level:'query',emit:'event'}]});
  client.$on('query',event=>queries.push(event.query));
  db=client;
  app=express();app.use('/api/collections',createCollectionsRouter(db));
});
afterEach(async()=>{
  await db.$disconnect();
  rmSync(dbFile,{force:true});
});
afterAll(()=>rmSync(directory,{recursive:true,force:true}));

async function createNativeBook(workId=collectionData.collections[0].books[0].id){
  const work=(await db.collectionWork.findUnique({where:{id:workId}}))!;
  const book=await db.book.create({data:{title:work.title,author:work.author,isbn:work.isbn}});
  await db.review.create({data:{bookId:book.id,telegramUserId:123n,reviewText:'Test review',reviewedAt:new Date(),sentiment:'positive'}});
  return book;
}

describe('database-backed collections',()=>{
  it('imports all current collections, works and positions through the migration',async()=>{
    expect(await db.bookCollection.count()).toBe(10);
    expect(await db.collectionWork.count()).toBe(141);
    expect(await db.collectionEntry.count()).toBe(160);
    expect(await db.book.count()).toBe(0);
    expect(await db.review.count()).toBe(0);
    const actual=await getCollections(db);
    expect(actual.map(c=>c.slug)).toEqual(collectionData.collections.map(c=>c.slug));
    for(const c of collectionData.collections){
      const detail=(await getCollection(c.slug,db))!;
      expect(detail.books.map(b=>b.id)).toEqual(c.books.map(b=>b.id));
      expect(detail.title).toBe(c.title);expect(detail.description).toBe(c.description);
    }
  });

  it('lists all collections with their actual entry counts and cover previews',async()=>{
    const response=await request(app).get('/api/collections');
    expect(response.status).toBe(200);expect(response.body.collections).toHaveLength(10);
    for(const tile of response.body.collections){
      expect([15,20]).toContain(tile.bookCount);expect(tile.coverUrls).toHaveLength(3);expect(tile.books).toBeUndefined();
    }
    expect(response.body.collections.filter((c:any)=>c.bookCount===20).map((c:any)=>c.slug)).toEqual(['life-changing','best-2023']);
  });

  it('serves complete ranked books and keeps alias fields private',async()=>{
    for(const summary of await getCollections(db)){
      const response=await request(app).get(`/api/collections/${summary.slug}`);
      expect(response.status).toBe(200);const c=response.body.collection;
      expect(c.books).toHaveLength(summary.bookCount);
      expect(new Set(c.books.map((b:any)=>b.id)).size).toBe(summary.bookCount);
      expect(c.sourceUrl).toMatch(/^https:\/\/vas3k\.club\//);
      for(const [i,b] of c.books.entries()){
        expect(b.rank).toBe(i+1);expect(b.title).toBeTruthy();expect(b.author).toBeTruthy();
        expect(validCatalogISBN(b.isbn)).toBe(b.isbn);
        expect(b.score).toBeCloseTo(calculateCollectionScore(b.mentions,b.weightedVotes),5);
        expect(existsSync(path.resolve('mini-app/public',b.coverUrl.slice(1)))).toBe(true);
        expect(b.bookId).toBeNull();expect(b.reviewCount).toBe(0);
        expect(b.titleAliases).toBeUndefined();expect(b.authorAliases).toBeUndefined();expect(b.catalogAliases).toBeUndefined();
      }
    }
  });

  it('returns edits to titles, descriptions and ordering without restarting the API',async()=>{
    await request(app).get('/api/collections');
    await db.bookCollection.update({where:{slug:'science'},data:{title:'Edited in the database',description:'New description',sortOrder:-1}});
    const response=await request(app).get('/api/collections');
    expect(response.body.collections[0]).toMatchObject({slug:'science',title:'Edited in the database',description:'New description'});
    expect((await request(app).get('/api/collections/science')).body.collection.title).toBe('Edited in the database');
  });

  it('preserves database edits and review data when migrations are run again',async()=>{
    await createNativeBook();
    await db.bookCollection.update({where:{slug:'science'},data:{title:'Keep my edit'}});
    await db.$disconnect();
    migrate(dbFile);
    expect((await getCollection('science',db))!.title).toBe('Keep my edit');
    expect(await db.bookCollection.count()).toBe(10);expect(await db.collectionEntry.count()).toBe(160);
    expect(await db.book.count()).toBe(1);expect(await db.review.count()).toBe(1);
  });

  it('adds a new collection and book directly through the database',async()=>{
    await db.bookCollection.create({data:{slug:'new-collection',tileTitle:'New',title:'Added in SQLite',description:'A new list',sortOrder:10,
      entries:{create:{rank:1,work:{create:{id:'new-work',title:'New Book',author:'New Author',isbn:'9780306406157',coverUrl:'/new-cover.jpg',goodreadsUrl:'https://www.goodreads.com/book/isbn/9780306406157'}}}}}});
    const list=await request(app).get('/api/collections');expect(list.body.collections).toHaveLength(11);
    const detail=(await request(app).get('/api/collections/new-collection')).body.collection;
    expect(detail.bookCount).toBe(1);expect(detail.sourceUrl).toBeNull();expect(detail.books[0].id).toBe('new-work');expect(detail.books[0].popularity).toBe(0);
  });

  it('reads changed membership and positions from the database',async()=>{
    const slug='life-changing';
    const original=(await getCollection(slug,db))!.books;
    await db.$transaction(async tx=>{
      await tx.collectionEntry.update({where:{collectionSlug_workId:{collectionSlug:slug,workId:original[0].id}},data:{rank:99}});
      await tx.collectionEntry.update({where:{collectionSlug_workId:{collectionSlug:slug,workId:original[1].id}},data:{rank:1}});
      await tx.collectionEntry.update({where:{collectionSlug_workId:{collectionSlug:slug,workId:original[0].id}},data:{rank:2}});
      await tx.collectionEntry.delete({where:{collectionSlug_workId:{collectionSlug:slug,workId:original.at(-1)!.id}}});
    });
    const edited=(await getCollection(slug,db))!;
    expect(edited.books.slice(0,2).map(b=>b.id)).toEqual([original[1].id,original[0].id]);
    expect(edited.bookCount).toBe(19);
  });

  it('matches newly added native books without writing during a GET request',async()=>{
    const first=collectionData.collections[0].books[0];const native=await createNativeBook(first.id);
    const result=(await request(app).get('/api/collections/life-changing')).body.collection.books[0];
    expect(result.bookId).toBe(native.id);expect(result.reviewCount).toBe(1);expect(result.votes).toBe(first.votes);
    expect((await db.collectionWork.findUnique({where:{id:first.id}}))!.bookId).toBeNull();
    expect((await getBookCollections(native,db)).map(c=>c.slug)).toContain('life-changing');
  });

  it('stores native catalogue links and keeps the review count live',async()=>{
    const native=await createNativeBook();
    const linked=await linkCollectionBooks(db);expect(linked.linked).toBeGreaterThan(0);
    const work=(await db.collectionWork.findUnique({where:{id:collectionData.collections[0].books[0].id}}))!;
    expect(work.bookId).toBe(native.id);
    await db.review.create({data:{bookId:native.id,telegramUserId:456n,reviewText:'Another review',reviewedAt:new Date()}});
    expect((await getCollection('life-changing',db))!.books[0].reviewCount).toBe(2);
    expect((await linkCollectionBooks(db)).linked).toBe(0);
  });

  it('respects manually assigned catalogue links',async()=>{
    await createNativeBook();
    const manual=await db.book.create({data:{title:'Manually selected edition',author:'Another spelling'}});
    await db.collectionWork.update({where:{id:collectionData.collections[0].books[0].id},data:{bookId:manual.id}});
    await linkCollectionBooks(db);
    expect((await getCollection('life-changing',db))!.books[0].bookId).toBe(manual.id);
  });

  it('keeps curated metadata and memberships if the native book is deleted',async()=>{
    const native=await createNativeBook();await linkCollectionBooks(db);
    await db.book.delete({where:{id:native.id}});
    const c=(await getCollection('life-changing',db))!;
    expect(c.books[0].bookId).toBeNull();expect(c.books[0].reviewCount).toBe(0);
    expect(c.books[0].title).toBe(collectionData.collections[0].books[0].title);
    expect(c.bookCount).toBe(20);
  });

  it('deleting a collection removes only its entries and preserves native books and reviews',async()=>{
    await createNativeBook();await linkCollectionBooks(db);
    await db.bookCollection.delete({where:{slug:'life-changing'}});
    expect(await db.collectionEntry.count({where:{collectionSlug:'life-changing'}})).toBe(0);
    expect(await db.collectionWork.count()).toBe(141);expect(await db.book.count()).toBe(1);expect(await db.review.count()).toBe(1);
    expect((await request(app).get('/api/collections/life-changing')).status).toBe(404);
  });

  it('returns standard book data and all memberships for a curated work',async()=>{
    const work=collectionData.collections.flatMap(c=>c.books).find(b=>collectionData.collections.filter(c=>c.books.some(x=>x.id===b.id)).length>1)!;
    const source=collectionData.collections.find(c=>c.books.some(b=>b.id===work.id))!;
    const result=await request(app).get(`/api/collections/${source.slug}/books/${work.id}`);
    expect(result.status).toBe(200);expect(result.body.book.id).toBeNull();expect(result.body.reviews).toEqual([]);
    expect(result.body.book.sentiments).toEqual({positive:0,negative:0,neutral:0});
    expect(result.body.collections.map((c:any)=>c.slug)).toEqual(collectionData.collections.filter(c=>c.books.some(b=>b.id===work.id)).map(c=>c.slug));
  });

  it('returns the native ID for a legacy collection book URL',async()=>{
    const native=await createNativeBook();await linkCollectionBooks(db);
    const workId=collectionData.collections[0].books[0].id;
    const response=await request(app).get(`/api/collections/life-changing/books/${workId}`);
    expect(response.body.bookId).toBe(native.id);
  });

  it('returns 404s without a catalogue scan for unknown collections or books',async()=>{
    expect((await request(app).get('/api/collections/missing')).status).toBe(404);
    expect((await request(app).get('/api/collections/science/books/missing')).status).toBe(404);
    expect(queries.some(q=>/FROM\s+(?:[`"]main[`"]\.)?[`"]books[`"]/.test(q))).toBe(false);
  });

  it('returns a handled error if the collections database cannot be read',async()=>{
    const unavailable=new PrismaClient({datasources:{db:{url:`file:${directory}/missing/blocked.db`}}});
    try {
      const offlineApp=express();offlineApp.use('/api/collections',createCollectionsRouter(unavailable));
      const result=await request(offlineApp).get('/api/collections');expect(result.status).toBe(500);expect(result.body.error).toBeTruthy();
    } finally {await unavailable.$disconnect();}
  });

  it('reads reviewed author corrections from the database without modifying native metadata',async()=>{
    const book=await db.book.create({data:{title:'Покров-17',author:'Виктор Пелевин'}});
    await linkCollectionBooks(db);
    expect((await getBookCollections(book,db)).map(c=>c.slug)).toContain('best-2021');
    expect(await getCorrectedCollectionAuthor(book,db)).toBe('Александр Пелевин');
    expect((await db.book.findUnique({where:{id:book.id}}))!.author).toBe('Виктор Пелевин');
    expect(await getCorrectedCollectionAuthor({...book,title:'Чапаев и Пустота'},db)).toBe('Виктор Пелевин');
  });
});
