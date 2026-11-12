import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCollection, type BookCollection } from '../api/client';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { useTranslation } from '../i18n';
import BookCard from '../components/BookCard';

export default function Collection() {
  const { slug } = useParams<{slug:string}>();
  const { t, plural } = useTranslation();
  const [collection, setCollection] = useState<BookCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);setError(null);setCollection(null);
    if (!slug) {setError(t('collections.notFound'));setLoading(false);return;}
    getCollection(slug).then(result => {if(active)setCollection(result.collection);})
      .catch(err => {if(active)setError(err instanceof Error?err.message:t('collections.loadError'));})
      .finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  }, [slug]);

  if (loading) return <Loading />;
  if (error || !collection) return <div className="p-4"><ErrorMessage message={error||t('collections.notFound')} /><Link to="/" className="text-sm">{t('common.back')}</Link></div>;
  const negative = collection.intent === 'anti_recommendations';

  return (
    <div className="p-4">
      <div className="rounded-2xl px-5 py-6 mb-6" style={{backgroundColor:collection.color}}>
        <p className="text-[11px] uppercase tracking-wider text-[#292b2b]/70 mb-2">{negative?t('collections.antiLabel'):t('collections.label')}</p>
        <h1 className="text-2xl font-bold leading-tight text-[#292b2b] mb-2">{collection.title}</h1>
        <p className="text-sm text-[#292b2b]/75">{collection.description}</p>
        <div className="flex items-center justify-between gap-3 mt-4 text-xs text-[#292b2b]/70">
          <span>{plural('plurals.books',collection.bookCount)}</span>
          {collection.sourceUrl && <a href={collection.sourceUrl} target="_blank" rel="noopener noreferrer" className="!text-[#292b2b] underline underline-offset-2">{t('collections.originalTopic')} ↗</a>}
        </div>
      </div>

      <div className="flex flex-col gap-3" aria-label={t('collections.booksList')}>
        {collection.books.map(book => (
          <BookCard key={book.id} book={book} rank={book.rank}
            to={book.bookId?`/book/${book.bookId}`:`/collections/${collection.slug}/books/${book.id}`} />
        ))}
      </div>
    </div>
  );
}
