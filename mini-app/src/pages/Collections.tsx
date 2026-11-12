import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCollections, type CollectionSummary } from '../api/client';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { useTranslation } from '../i18n';

export default function Collections() {
  const { t, plural } = useTranslation();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getCollections().then(result => { if (active) setCollections(result.collections); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-2">{t('collections.title')}</h1>
      {loading ? <Loading /> : error ? (
        <div>
          <ErrorMessage message={t('collections.loadError')} />
          <button type="button" onClick={() => setAttempt(a => a+1)} className="text-sm text-tg-link underline underline-offset-4">{t('collections.retry')}</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-tg-hint mb-5">{plural('plurals.collections', collections.length)}</p>
          {collections.length === 0 ? <p className="text-sm text-tg-hint py-4">{t('collections.empty')}</p> : (
            <div className="flex flex-col gap-3" aria-label={t('collections.allList')}>
              {collections.map(collection => (
                <Link key={collection.slug} to={`/collections/${collection.slug}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-tg-secondary no-underline hover:opacity-80 transition-opacity">
                  <div className="relative w-20 h-24 flex-shrink-0 rounded-xl overflow-hidden" style={{backgroundColor:collection.color}} aria-hidden="true">
                    {collection.coverUrls.map((cover, i) => (
                      <img key={cover} src={cover} alt="" loading="lazy" className="absolute w-10 h-[60px] object-cover rounded-sm shadow-md"
                        style={{left:4+i*14,top:20+(i%2)*5,transform:`rotate(${[-10,0,10][i]}deg)`}} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-tg-text leading-snug">{collection.title}</h2>
                    <p className="text-xs text-tg-hint mt-1 line-clamp-2">{collection.description}</p>
                    <p className="text-xs text-tg-hint mt-2">{plural('plurals.books',collection.bookCount)}</p>
                  </div>
                  <span className="text-tg-hint flex-shrink-0" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
