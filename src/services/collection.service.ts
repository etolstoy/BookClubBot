import type { Prisma, PrismaClient, BookCollection, CollectionWork } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { normalizeString } from '../lib/string-utils.js';
import { findCollectionBookMatch, type CollectionMatchSource, type LocalCollectionBook } from '../lib/collection-matching.js';

export { findCollectionBookMatch, normalizeCollectionISBN } from '../lib/collection-matching.js';
export type { LocalCollectionBook } from '../lib/collection-matching.js';

const localBookSelect = {id:true,title:true,author:true,isbn:true,_count:{select:{reviews:true}}} satisfies Prisma.BookSelect;
const workInclude = {book:{select:localBookSelect}} satisfies Prisma.CollectionWorkInclude;
const entryInclude = {work:{include:workInclude}} satisfies Prisma.CollectionEntryInclude;
type Entry = Prisma.CollectionEntryGetPayload<{include:typeof entryInclude}>;

function matchSource(work: CollectionWork): CollectionMatchSource {
  return {isbn:work.isbn,titleAliases:[work.title,...JSON.parse(work.titleAliases)],
    authorAliases:[work.author,...JSON.parse(work.authorAliases)],catalogAliases:JSON.parse(work.catalogAliases)};
}

type SummarySource = BookCollection & {entries:Array<{work:{coverUrl:string}}>};
function summary(collection: SummarySource) {
  return {slug:collection.slug,tileTitle:collection.tileTitle,title:collection.title,
    description:collection.description,color:collection.color,intent:collection.intent,
    bookCount:collection.entries.length,coverUrls:collection.entries.slice(0,3).map(e=>e.work.coverUrl)};
}

function membership(collection: BookCollection) {
  return {slug:collection.slug,title:collection.title,tileTitle:collection.tileTitle,color:collection.color};
}

function serializeEntry(entry: Entry, books: LocalCollectionBook[], highestScore: number) {
  const work=entry.work;
  const bookId=work.bookId??findCollectionBookMatch(matchSource(work),books);
  const matched=work.book??books.find(b=>b.id===bookId);
  return {id:work.id,rank:entry.rank,title:work.title,author:work.author,isbn:work.isbn,
    coverUrl:work.coverUrl,goodreadsUrl:work.goodreadsUrl,mentions:entry.mentions,allMentions:entry.allMentions,
    votes:entry.votes,weightedVotes:entry.weightedVotes,score:entry.score,
    bookId:matched?.id??null,reviewCount:matched?._count?.reviews??0,
    popularity:highestScore>0?Math.round(entry.score/highestScore*1000)/10:0};
}

const loadLocalBooks = (db: PrismaClient) => db.book.findMany({select:localBookSelect});

export async function getCollections(db: PrismaClient=prisma) {
  const collections=await db.bookCollection.findMany({orderBy:[{sortOrder:'asc'},{slug:'asc'}],
    include:{entries:{orderBy:{rank:'asc'},select:{work:{select:{coverUrl:true}}}}}});
  return collections.map(summary);
}

export async function getCollection(slug: string, db: PrismaClient=prisma) {
  const collection=await db.bookCollection.findUnique({where:{slug},
    include:{entries:{orderBy:{rank:'asc'},include:entryInclude}}});
  if(!collection)return null;
  const localBooks=collection.entries.some(e=>!e.work.book)?await loadLocalBooks(db):[];
  const highestScore=Math.max(0,...collection.entries.map(e=>e.score));
  return {...summary(collection),sourceUrl:collection.sourceUrl,sourceTitle:collection.sourceTitle,
    sourceSnapshotAt:collection.sourceSnapshotAt?.toISOString()??null,
    books:collection.entries.map(entry=>serializeEntry(entry,localBooks,highestScore))};
}

export async function getBookCollections(book: LocalCollectionBook, db: PrismaClient=prisma) {
  const works=await db.collectionWork.findMany({where:{OR:[{bookId:book.id},{bookId:null}]},
    include:{entries:{include:{collection:true}}}});
  const result=new Map<string,BookCollection>();
  for(const work of works){
    if(work.bookId!==book.id&&findCollectionBookMatch(matchSource(work),[book])!==book.id)continue;
    for(const entry of work.entries)result.set(entry.collection.slug,entry.collection);
  }
  return [...result.values()].sort((a,b)=>a.sortOrder-b.sortOrder||a.slug.localeCompare(b.slug)).map(membership);
}

export async function getCorrectedCollectionAuthor(book: LocalCollectionBook, db: PrismaClient=prisma) {
  const works=await db.collectionWork.findMany({where:{catalogAliases:{not:'[]'},OR:[{bookId:book.id},{bookId:null}]}});
  const corrected=works.find(work=>matchSource(work).catalogAliases?.some(alias=>
    normalizeString(alias.title)===normalizeString(book.title)
      &&book.author&&normalizeString(alias.author)===normalizeString(book.author)));
  return corrected?.author??book.author;
}

export async function getCollectionBook(slug: string, workId: string, db: PrismaClient=prisma) {
  const entry=await db.collectionEntry.findUnique({where:{collectionSlug_workId:{collectionSlug:slug,workId}},include:entryInclude});
  if(!entry)return null;
  const localBooks=entry.work.book?[]:await loadLocalBooks(db);
  const book=serializeEntry(entry,localBooks,entry.score);
  const collections=await db.bookCollection.findMany({where:{entries:{some:{workId}}},orderBy:[{sortOrder:'asc'},{slug:'asc'}]});
  return {bookId:book.bookId,
    book:{id:null,title:book.title,author:book.author,coverUrl:book.coverUrl,isbn:book.isbn,
      goodreadsUrl:book.goodreadsUrl,description:null,genres:[],publicationYear:null,pageCount:null,
      googleBooksUrl:null,reviewCount:0,sentiments:{positive:0,negative:0,neutral:0}},
    reviews:[],collections:collections.map(membership)};
}

/** Fill only missing catalogue links. Titles, order, scores and existing manual links are preserved. */
export async function linkCollectionBooks(db: PrismaClient=prisma) {
  const works=await db.collectionWork.findMany({where:{bookId:null}});
  if(!works.length)return {linked:0,unmatched:0};
  const books=await loadLocalBooks(db);
  const matches=works.flatMap(work=>{
    const bookId=findCollectionBookMatch(matchSource(work),books);
    return bookId===null?[]:[{workId:work.id,bookId}];
  });
  const updates=await db.$transaction(matches.map(({workId,bookId})=>db.collectionWork.updateMany({
    where:{id:workId,bookId:null},data:{bookId},
  })));
  return {linked:updates.reduce((sum,result)=>sum+result.count,0),unmatched:works.length-matches.length};
}
