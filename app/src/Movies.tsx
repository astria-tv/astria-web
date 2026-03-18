import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Movies.css';

/* ─── Types ─── */
interface Movie {
  title: string;
  year: string;
  posterURL: string;
  uuid: string;
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
    }
  }`;
}

async function gqlFetch<T>(query: string): Promise<T> {
  const jwt = sessionStorage.getItem('jwt');
  const res = await fetch('/olaris/m/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

/* ─── Component ─── */
export default function Movies() {
  const navigate = useNavigate();
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="16" y2="12" />
            <line x1="4" y1="18" x2="12" y2="18" />
          </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
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
              <div
                className="poster-card"
                key={movie.uuid}
                onClick={() => navigate(`/movie/${movie.uuid}`)}
              >
                <div className="poster">
                  {movie.posterURL && (
                    <img
                      src={movie.posterURL}
                      alt={movie.title}
                      loading="lazy"
                      onLoad={e => e.currentTarget.classList.add('loaded')}
                    />
                  )}
                  <div className="overlay">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  </div>
                </div>
                <div className="p-title">{movie.title}</div>
                <div className="p-year">{movie.year}</div>
              </div>
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
