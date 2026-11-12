import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCollections, type CollectionSummary } from '../api/client';
import { useTranslation } from '../i18n';

export default function CollectionsSection() {
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
    <section className="mb-8" aria-labelledby="collections-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="collections-heading" className="text-xl font-bold text-tg-text">{t('collections.title')}</h2>
        {!loading && !error && (
          <Link to="/collections" className="inline-flex items-center gap-1 py-2 text-xs text-tg-link underline underline-offset-4 hover:opacity-80">
            {plural('plurals.collections', collections.length)} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      {error ? (
        <div className="rounded-lg bg-tg-secondary p-4 text-sm">
          <p className="text-tg-hint mb-2">{t('collections.loadError')}</p>
          <button type="button" onClick={() => setAttempt(a => a+1)} className="font-medium text-tg-text">{t('collections.retry')}</button>
        </div>
      ) : (
        <div className="grid grid-flow-col grid-rows-1 auto-cols-[160px] sm:auto-cols-[190px] gap-3 overflow-x-auto pb-2 -mx-4 px-4 scroll-pl-4 snap-x snap-mandatory">
          {loading ? Array.from({length:4}, (_, i) => (
            <div key={i} className="h-[166px] rounded-2xl bg-tg-secondary motion-safe:animate-pulse" aria-hidden="true" />
          )) : collections.map(collection => (
            <Link key={collection.slug} to={`/collections/${collection.slug}`}
              className="relative h-[166px] overflow-hidden rounded-2xl p-3 snap-start transition-opacity hover:opacity-90 no-underline"
              style={{backgroundColor:collection.color}}
              aria-label={`${collection.tileTitle}, ${plural('plurals.books',collection.bookCount)}`}>
              <h3 className="relative z-10 text-[15px] leading-[19px] font-semibold text-[#292b2b]">{collection.tileTitle}</h3>
              <p className="relative z-10 mt-1 text-[11px] text-[#292b2b]/70">{plural('plurals.books',collection.bookCount)}</p>
              <span aria-hidden="true" className="absolute bottom-3 left-3 text-sm text-[#292b2b]/50">→</span>
              <div aria-hidden="true">
                {collection.coverUrls.map((cover, i) => (
                  <img key={cover} src={cover} alt="" loading="lazy" className="absolute w-[52px] h-[78px] object-cover rounded-sm shadow-md"
                    style={{right:10+i*24,bottom:17+(i%2)*4,transform:`rotate(${[8,-4,-14][i]}deg)`,zIndex:3-i}} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
