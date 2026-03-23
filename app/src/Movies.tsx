import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './Movies.css';
import { getJwt, handleAuthFailure } from './auth';
import PosterCard from './PosterCard';
import { SearchIcon, SortIcon, FilmSimpleIcon } from './Icons';

/* ─── Types ─── */
interface StreamInfo {
  codecName: string | null;
  bitRate: number | null;
  streamType: string | null;
  resolution: string | null;
}

interface MovieFile {
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: StreamInfo[];
}

interface Movie {
  title: string;
  year: string;
  posterURL: string;
  uuid: string;
  playState: { finished: boolean; playtime: number } | null;
  files: MovieFile[];
}

type SortOption = 'title' | 'releaseDate';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const SORT_LABELS: Record<SortOption, string> = {
  title: 'Title',
  releaseDate: 'Release Date',
};

/* ─── GraphQL ─── */
const COUNT_QUERY = `{ mediaStats { movieCount } }`;

function buildPageQuery(sort: SortOption, sortDirection: SortDir, offset: number) {
  return `{
    movies(offset: ${offset}, limit: ${PAGE_SIZE}, sort: ${sort}, sortDirection: ${sortDirection}) {
      title
      year
      posterURL(width: 300)
      uuid
      playState { finished playtime }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
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
export default function Movies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortOption>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const hasMore = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch total count (lightweight)
  useEffect(() => {
    gqlFetch<{ mediaStats: { movieCount: number } }>(COUNT_QUERY)
      .then(d => setTotalCount(d.mediaStats.movieCount))
      .catch(() => {});
  }, []);

  // Reset & fetch first page when sort changes
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    hasMore.current = true;
    try {
      const data = await gqlFetch<{ movies: Movie[] }>(
        buildPageQuery(sort, sortDir, 0),
      );
      setMovies(data.movies);
      if (data.movies.length < PAGE_SIZE) hasMore.current = false;
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
      const data = await gqlFetch<{ movies: Movie[] }>(
        buildPageQuery(sort, sortDir, movies.length),
      );
      if (data.movies.length < PAGE_SIZE) hasMore.current = false;
      setMovies(prev => [...prev, ...data.movies]);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, sort, sortDir, movies.length]);

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
    if (!filter.trim()) return movies;
    const q = filter.toLowerCase();
    return movies.filter(m => m.title.toLowerCase().includes(q));
  }, [movies, filter]);

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

  const displayCount = filter.trim() ? filtered.length : totalCount || movies.length;

  return (
    <>
      {/* Header */}
      <div className="movies-header">
        <h1>
          Movies{' '}
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
          <FilmSimpleIcon strokeWidth={1.5} />
          {filter ? (
            <>
              <h2>No matches</h2>
              <p>No movies match &ldquo;{filter}&rdquo;</p>
            </>
          ) : (
            <>
              <h2>No movies yet</h2>
              <p>Add a movie library to get started</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="movies-grid">
            {filtered.map(movie => (
              <PosterCard
                key={movie.uuid}
                posterUrl={movie.posterURL}
                title={movie.title}
                subtitle={movie.year}
                detailPath={`/movie/${movie.uuid}`}
                mediaType="movie"
                files={movie.files}
                playState={movie.playState}
                mediaUuid={movie.uuid}
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
