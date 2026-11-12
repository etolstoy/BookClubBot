import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COLLECTION_VOTE_WEIGHT, COLLECTION_BASE_BOOK_LIMIT, COLLECTION_BOOK_LIMIT, COLLECTION_MIN_EXTENSION_SPREAD, COLLECTION_MIN_CUTOFF_GAP, rankCollectionBooks, selectCollectionBooks } from '../src/lib/collection-ranking.js';
import { validCatalogISBN } from '../src/services/book-catalog.service.js';

const catalog = JSON.parse(await readFile('reports/vas3k-books/catalog.json', 'utf8'));
const rawRegistry = JSON.parse(await readFile('data/vas3k-books/registry.json', 'utf8').catch(() => '{"books":[]}'));
// Reviewed edition title and a catalogue typo confirmed by the original review.
// Keep erroneous catalogue authors separate from canonical author aliases.
const catalogCorrections: Record<string,{titles?:string[];catalogAliases?:Array<{title:string;author:string}>}> = {
  '07247af0db24d0f9': {titles:['The Seven Deaths of Evelyn Hardcastle']},
  '231be775462aab65': {catalogAliases:[{title:'Покров-17',author:'Виктор Пелевин'}]},
};
const definitions = [
  { sourceId: 'post-2389', slug: 'life-changing', tileTitle: 'Меняют жизнь', title: 'Книги, которые меняют жизнь', description: 'Книги, разделившие жизнь на до и после: клубчане рассказывают, что вынесли из них и как это изменило их взгляд на себя и мир.', color: '#e9e5f4' },
  { sourceId: 'post-6558', slug: 'unusual', tileTitle: 'Необычные книги', title: 'Необычные книги', description: 'Ни на что не похожий читательский опыт: романы-загадки, переписка на полях и книги, которые играют с самой формой чтения.', color: '#f4e6da' },
  { sourceId: 'question-4784', slug: 'science', tileTitle: 'Научпоп', title: 'Научпоп, который увлекает', description: 'Ответы на вопрос о научпопе, который «вот прямо очень зашёл»: книги о человеке, природе и устройстве мира, увлёкшие клубчан.', color: '#e0ece7' },
  { sourceId: 'question-32013', slug: 'childhood', tileTitle: 'Из детства', title: 'Любимые книги детства', description: 'Клубчане вспоминают книги своего детства — истории, с которыми росли, которые перечитывали и помнят до сих пор.', color: '#f4ecd8' },
  ...[2025, 2024, 2023, 2022, 2021].map(year => ({ sourceId: ({2025:'thread-30223',2024:'thread-26660',2023:'thread-22046',2022:'post-17764',2021:'post-13301'} as Record<number,string>)[year], slug: `best-${year}`, tileTitle: `Лучшее — ${year}`, title: `Любимые книги ${year} года`, description: year >= 2023
    ? `Лучшее из прочитанного клубчанами в ${year} году, независимо от даты издания. В исходной теме выбирали тройку любимых книг и обсуждали разочарования${year >= 2024 ? ' и guilty pleasure' : ''}.`
    : year === 2022 ? 'Книжные итоги 2022 года: личные топы, анти-топы и читательские челленджи. Здесь — книги, которые клубчане выделили среди лучших.'
    : 'Личные книжные топы клубчан за 2021 год: что запомнилось больше всего из прочитанного и почему хочется посоветовать это другим.', color: ({2025:'#e2eaf3',2024:'#ece5ed',2023:'#e5ebdd',2022:'#efe4db',2021:'#e3e8ea'} as Record<number,string>)[year] })),
  { sourceId: 'thread-23224', slug: 'not-recommended', tileTitle: 'Не советуют', title: 'Книги, которые не советуют читать', description: 'Книги, от чтения которых клубчане предостерегают, и их аргументы: чем популярная рекомендация может навредить. Критикуют книги, а не читателей.', color: '#f3e2df' },
];

await mkdir('scripts/data', { recursive: true });
await mkdir('mini-app/public/collection-covers', { recursive: true });
await mkdir('reports/collections-ranking', { recursive: true });
const experiments: any[] = [];
const expansionDecisions: any[] = [];
const collections = [];
for (const definition of definitions) {
  const topic = catalog.topics.find((t: any) => t.id === definition.sourceId);
  if (!topic) throw new Error(`Missing collection source: ${definition.sourceId}`);
  const intent = topic.intent === 'anti_recommendations' ? topic.intent : 'recommendations';
  const baseline = rankCollectionBooks(topic.books, intent, 0).slice(0, COLLECTION_BASE_BOOK_LIMIT);
  experiments.push({ sourceId: topic.id, title: definition.title,
    variants: [0, 0.15, 0.2, 0.25, 0.35, 0.5, 1].map(weight => {
      const top = rankCollectionBooks(topic.books, intent, weight).slice(0, COLLECTION_BASE_BOOK_LIMIT);
      return { weight, overlapWithMentions: top.filter(b => baseline.some(x => x.id === b.id)).length,
        meanMentions: top.reduce((sum,b) => sum+b.mentions,0)/top.length,
        singleMentions: top.filter(b => b.mentions === 1).length,
        books: top.map(b => ({id:b.id,title:b.title,mentions:b.mentions,weightedVotes:b.weightedVotes,score:b.score})) };
    }) });
  const allRanked = rankCollectionBooks(topic.books, intent);
  const {books:ranked,...selection} = selectCollectionBooks(allRanked);
  if (ranked.length < COLLECTION_BASE_BOOK_LIMIT) throw new Error(`Expected at least ${COLLECTION_BASE_BOOK_LIMIT} eligible books: ${topic.id}`);
  expansionDecisions.push({slug:definition.slug,title:definition.title,bookCount:ranked.length,...selection,
    bracket:allRanked.slice(COLLECTION_BASE_BOOK_LIMIT,COLLECTION_BOOK_LIMIT+1).map((book,i)=>({
      rank:COLLECTION_BASE_BOOK_LIMIT+i+1,id:book.id,title:book.title,mentions:book.mentions,
      weightedVotes:Number(book.weightedVotes.toFixed(6)),score:Number(book.score.toFixed(6)),
    }))});
  const books = [];
  for (const [index, book] of ranked.entries()) {
    if (!validCatalogISBN(book.isbn)) throw new Error(`Invalid collection ISBN: ${book.title}`);
    const key = createHash('sha256').update(book.coverUrl!).digest('hex');
    const cover = JSON.parse(await readFile(`data/vas3k-books/covers/${key}.json`, 'utf8'));
    if (!cover.ok) throw new Error(`Unverified collection cover: ${book.title}`);
    const thumb = JSON.parse(await readFile(`data/vas3k-books/covers/${key}.thumb.json`, 'utf8').catch(() => 'null'));
    const mime = thumb?.mime || cover.mime;
    const extension = ({'image/webp':'webp','image/png':'png','image/jpeg':'jpg','image/gif':'gif'} as Record<string,string>)[mime];
    if (!extension) throw new Error(`Unsupported collection cover: ${mime}`);
    const coverUrl = `/collection-covers/${book.id}.${extension}`;
    await copyFile(`data/vas3k-books/covers/${key}${thumb?'.thumb':''}.bin`, `mini-app/public${coverUrl}`);
    const originalAuthor = rawRegistry.books.find((b:any) => b.id === book.id)?.author;
    books.push({ id:book.id, rank:index+1, title:book.title, author:book.author!, isbn:book.isbn!, coverUrl,
      goodreadsUrl:`https://www.goodreads.com/book/isbn/${book.isbn}`,
      mentions:book.mentions, allMentions:book.allMentions, votes:book.votes,
      weightedVotes:Number(book.weightedVotes.toFixed(6)), score:Number(book.score.toFixed(6)),
      titleAliases:[...new Set([book.title,book.originalTitle,...(book.aliases||[]),...(catalogCorrections[book.id]?.titles||[])].filter(Boolean))],
      authorAliases:[...new Set([book.author,originalAuthor].filter(Boolean))],
      ...(catalogCorrections[book.id]?.catalogAliases ? {catalogAliases:catalogCorrections[book.id].catalogAliases} : {}),
    });
  }
  collections.push({ ...definition, intent, sourceUrl:topic.url, sourceTitle:topic.title, books });
}
const output = { version:1, sourceSnapshotAt:catalog.topics[0].source.fetchedAt,
  ranking:{ formula:'mentions + 0.2 * log2(1 + weightedVotes)', voteWeight:COLLECTION_VOTE_WEIGHT,
    votes:'Голоса комментария делятся между всеми названными в нём произведениями; голоса за основной пост исключены.',
    mentions:'Разные сообщения с положительной оценкой; для антирекомендаций — с отрицательной. Повторения внутри сообщения считаются один раз.',
    eligibility:'Только книги с подтверждёнными названием, автором, ISBN и обложкой.',
    selection:{baseLimit:COLLECTION_BASE_BOOK_LIMIT,maxLimit:COLLECTION_BOOK_LIMIT,
      minExtensionSpread:COLLECTION_MIN_EXTENSION_SPREAD,minCutoffGap:COLLECTION_MIN_CUTOFF_GAP} }, collections };
await writeFile('scripts/data/book-collections-seed.json', JSON.stringify(output,null,2)+'\n');
await writeFile('reports/collections-ranking/comparison.json', JSON.stringify({selectedWeight:COLLECTION_VOTE_WEIGHT,experiments},null,2)+'\n');
await writeFile('reports/collections-ranking/expansion.json', JSON.stringify({
  policy:output.ranking.selection,decisions:expansionDecisions,
},null,2)+'\n');
console.log(JSON.stringify({collections:collections.length,entries:collections.reduce((s,c)=>s+c.books.length,0),uniqueBooks:new Set(collections.flatMap(c=>c.books.map(b=>b.id))).size,
  weights:[0,.15,.2,.25,.35,.5,1],selectedWeight:COLLECTION_VOTE_WEIGHT,
  collectionSizes:collections.map(c=>({slug:c.slug,books:c.books.length})),
  overlapAtSelectedWeight:experiments.map(t=>({topic:t.sourceId,overlap:t.variants.find((v:any)=>v.weight===COLLECTION_VOTE_WEIGHT).overlapWithMentions}))},null,2));
