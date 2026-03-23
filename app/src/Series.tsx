import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './Movies.css';
import { getJwt, handleAuthFailure } from './auth';
import PosterCard from './PosterCard';
import { SearchIcon, SortIcon, TvIcon } from './Icons';

/* ─── Types ─── */
interface SeriesItem {
  name: string;
  firstAirDate: string;
  posterPath: string;
  uuid: string;
}

type SortOption = 'name' | 'firstAirDate';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  firstAirDate: 'First Aired',
};

/* ─── Helpers ─── */
function tmdbImg(path: string, size = 'w300'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/* ─── GraphQL ─── */
const COUNT_QUERY = `{ mediaStats { seriesCount } }`;

function buildPageQuery(sort: SortOption, sortDirection: SortDir, offset: number) {
  return `{
    series(offset: ${offset}, limit: ${PAGE_SIZE}, sort: ${sort}, sortDirection: ${sortDirection}) {
      name
      firstAirDate
      posterPath
      uuid
    }
  }`;
}

async function gqlFetch<T>(query: string): Promise<T> {
  const jwt = getJwt();
  const res = await fetch('/olaris/m/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

/* ─── Component ─── */
export default function Series() {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortOption>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const hasMore = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch total count
  useEffect(() => {
    gqlFetch<{ mediaStats: { seriesCount: number } }>(COUNT_QUERY)
      .then(d => setTotalCount(d.mediaStats.seriesCount))
      .catch(() => {});
  }, []);

  // Reset & fetch first page when sort changes
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    hasMore.current = true;
    try {
      const data = await gqlFetch<{ series: SeriesItem[] }>(
        buildPageQuery(sort, sortDir, 0),
      );
      setSeries(data.series);
      if (data.series.length < PAGE_SIZE) hasMore.current = false;
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sort, sortDir]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore.current) return;
    setLoadingMore(true);
    try {
      const data = await gqlFetch<{ series: SeriesItem[] }>(
        buildPageQuery(sort, sortDir, series.length),
      );
      if (data.series.length < PAGE_SIZE) hasMore.current = false;
      setSeries(prev => [...prev, ...data.series]);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, sort, sortDir, series.length]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const close = () => setShowSortMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showSortMenu]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return series;
    const q = filter.toLowerCase();
    return series.filter(s => s.name.toLowerCase().includes(q));
  }, [series, filter]);

  function handleSortChange(newSort: SortOption) {
    if (newSort === sort) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(newSort);
      setSortDir('asc');
    }
    setShowSortMenu(false);
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  const displayCount = filter.trim() ? filtered.length : totalCount || series.length;

  return (
    <>
      {/* Header */}
      <div className="movies-header">
        <h1>
          TV Shows{' '}
          <span className="movies-count">({displayCount})</span>
        </h1>
      </div>

      {/* Filters bar */}
      <div className="movies-filters">
        <div className="movies-filter-input">
          <SearchIcon />
          <input
            type="text"
            placeholder="Filter by title…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div
          className="movies-sort-btn"
          onClick={e => {
            e.stopPropagation();
            setShowSortMenu(v => !v);
          }}
        >
          <SortIcon width={14} height={14} />
          {SORT_LABELS[sort]} {sortDir === 'asc' ? '↑' : '↓'}

          {showSortMenu && (
            <div className="sort-dropdown" onClick={e => e.stopPropagation()}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map(key => (
                <button
                  key={key}
                  className={sort === key ? 'active' : ''}
                  onClick={() => handleSortChange(key)}
                >
                  {SORT_LABELS[key]}
                  {sort === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="movies-empty">
          <TvIcon strokeWidth={1.5} />
          {filter ? (
            <>
              <h2>No matches</h2>
              <p>No shows match &ldquo;{filter}&rdquo;</p>
            </>
          ) : (
            <>
              <h2>No TV shows yet</h2>
              <p>Add a series library to get started</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="movies-grid">
            {filtered.map(show => (
              <PosterCard
                key={show.uuid}
                posterUrl={tmdbImg(show.posterPath)}
                title={show.name}
                subtitle={show.firstAirDate?.substring(0, 4)}
                detailPath={`/series/${show.uuid}`}
                mediaType="series"
                mediaUuid={show.uuid}
              />
            ))}
          </div>
          {/* Infinite scroll sentinel */}
          {!filter.trim() && hasMore.current && (
            <div ref={sentinelRef} className="movies-load-more">
              {loadingMore && <div className="spinner" />}
            </div>
          )}
        </>
      )}
    </>
  );
}
