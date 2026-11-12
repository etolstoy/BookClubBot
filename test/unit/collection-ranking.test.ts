import { describe, it, expect } from 'vitest';
import { rankCollectionBooks, calculateCollectionScore, selectCollectionBooks, type CollectionSourceBook, type CollectionMention } from '../../src/lib/collection-ranking.js';

const mention = (id:string, votes=0, booksInMessage=1, stance='positive', messageType='comment'):CollectionMention => ({messageId:id,votes,booksInMessage,stance,messageType});
const book = (id:string, mentions:CollectionMention[], overrides:Partial<CollectionSourceBook>={}):CollectionSourceBook => ({
  id,title:id,author:'Author',isbn:'9780385676526',coverUrl:'/cover.jpg',metadataStatus:'complete',kind:'book',mentions,...overrides,
});

describe('collection expansion',()=>{
  const ranked=(scores:number[])=>[...Array.from({length:15},(_,i)=>({id:i,score:20-i})),...scores.map((score,i)=>({id:15+i,score}))];
  it('expands to 20 when both the bracket spread and cutoff gap are meaningful',()=>{
    const result=selectCollectionBooks(ranked([3,2.9,2.8,2.7,2.6,2.5]));
    expect(result.books).toHaveLength(20);expect(result.expanded).toBe(true);expect(result.reason).toBe('clear_extension');
  });
  it('keeps 15 when the added bracket is nearly flat despite a clear cutoff',()=>{
    const result=selectCollectionBooks(ranked([2,1.99,1.98,1.97,1.96,1.5]));
    expect(result.books).toHaveLength(15);expect(result.reason).toBe('flat_extension');
  });
  it('does not split tied scores at the 20th book',()=>{
    const result=selectCollectionBooks(ranked([3,2.8,2.7,2.6,2.5,2.5]));
    expect(result.books).toHaveLength(15);expect(result.reason).toBe('weak_cutoff');
  });
  it('requires more than a rounding difference at the cutoff',()=>{
    const result=selectCollectionBooks(ranked([3,2.8,2.7,2.6,2.5,2.49]));
    expect(result.books).toHaveLength(15);expect(result.reason).toBe('weak_cutoff');
  });
  it('accepts the exact thresholds without floating point boundary errors',()=>{
    const result=selectCollectionBooks(ranked([2.7,2.68,2.66,2.63,2.6,2.55]));
    expect(result.books).toHaveLength(20);expect(result.extensionSpread).toBe(.1);expect(result.cutoffGap).toBe(.05);
  });
  it('keeps 15 if there are fewer than 20 eligible books and never fills with invalid entries',()=>{
    expect(selectCollectionBooks(ranked([3,2.8,2.7,2.6])).books).toHaveLength(15);
    expect(selectCollectionBooks(ranked([3,2.8,2.7,2.6])).reason).toBe('insufficient_books');
    expect(selectCollectionBooks([{score:1}]).books).toHaveLength(1);
  });
  it('can include all 20 eligible books without an artificial cutoff comparison',()=>{
    const result=selectCollectionBooks(ranked([3,2.8,2.7,2.6,2.5]));
    expect(result.books).toHaveLength(20);expect(result.cutoffGap).toBeNull();
  });
});

describe('collection ranking', () => {
  it('gives repeated recommendations substantially more weight than votes', () => {
    const repeated=book('repeated',[mention('a'),mention('b')]);
    const popular=book('popular',[mention('c',30)]);
    expect(rankCollectionBooks([popular,repeated])[0].id).toBe('repeated');
    expect(calculateCollectionScore(1,31)).toBeCloseTo(calculateCollectionScore(2,0));
    expect(rankCollectionBooks([book('very-popular',[mention('d',63)]),repeated])[0].id).toBe('very-popular');
  });
  it('uses support to order equally mentioned books', () => {
    expect(rankCollectionBooks([book('less',[mention('a',1)]),book('more',[mention('b',10)])]).map(b=>b.id)).toEqual(['more','less']);
  });
  it('shares list votes between its books and excludes the original post votes', () => {
    const result=rankCollectionBooks([book('test',[mention('post',1000,1,'positive','post'),mention('a',100,10)])])[0];
    expect(result.mentions).toBe(2);
    expect(result.votes).toBe(100);
    expect(result.weightedVotes).toBe(10);
    expect(result.score).toBeCloseTo(calculateCollectionScore(2,10));
  });
  it('counts the same message only once, including when aliases repeat', () => {
    const result=rankCollectionBooks([book('test',[mention('same',5),mention('same',5)])])[0];
    expect(result.mentions).toBe(1);expect(result.votes).toBe(5);
  });
  it('keeps criticism separate from recommendations and ignores plans/neutral mentions', () => {
    const source=[book('test',[mention('a',5,1,'positive'),mention('b',10,1,'negative'),mention('c',50,1,'neutral')])];
    expect(rankCollectionBooks(source)[0]).toMatchObject({mentions:1,votes:5,allMentions:3});
    expect(rankCollectionBooks(source,'anti_recommendations')[0]).toMatchObject({mentions:1,votes:10,allMentions:3});
  });
  it('does not include unresolved books or cycles in a curated top', () => {
    const source=[book('series',[mention('a')],{kind:'series'}),book('missing',[mention('b')],{isbn:null}),book('unverified',[mention('c')],{metadataStatus:'partial'})];
    expect(rankCollectionBooks(source)).toEqual([]);
  });
  it('has stable ties regardless of input order', () => {
    const a=book('А',[mention('a')]),b=book('Б',[mention('b')]);
    expect(rankCollectionBooks([b,a]).map(b=>b.id)).toEqual(rankCollectionBooks([a,b]).map(b=>b.id));
  });
});
