import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getJwt, clearAuth, parseJwt, handleAuthFailure } from './auth';
import PosterCard from './PosterCard';
import {
  HomeIcon, FilmIcon, TvIcon, FilePlusIcon, StreamIcon, SettingsIcon,
  ChevronLeftIcon, SearchIcon, LogoutIcon, CloseIcon, BookmarkIcon,
} from './Icons';

/* ─── Types ─── */
interface Movie {
  __typename: 'Movie';
  title: string;
  year: string;
  posterURL: string;
  uuid: string;
}

interface Series {
  __typename: 'Series';
  name: string;
  posterPath: string;
  uuid: string;
  firstAirDate: string;
}

type SearchItem = Movie | Series;

const SEARCH_QUERY = `query Search($name: String!) {
  search(name: $name) {
    __typename
    ... on Movie {
      title
      year
      posterURL(width: 300)
      uuid
    }
    ... on Series {
      name
      posterPath
      uuid
      firstAirDate
    }
  }
}`;

function tmdbImg(path: string, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

async function gqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const jwt = getJwt();
  const res = await fetch('/astria/m/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

const SESSIONS_COUNT_QUERY = `{ sessions { sessionID } }`;

async function fetchSessionCount(): Promise<number> {
  const jwt = getJwt();
  const res = await fetch('/astria/s/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query: SESSIONS_COUNT_QUERY }),
  });
  if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
  if (!res.ok) return 0;
  const json = await res.json();
  return json.data?.sessions?.length ?? 0;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[] | null>(null);
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const showBack = location.pathname !== '/dashboard';

  const isAdmin = useMemo(() => {
    const jwt = getJwt();
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  }, []);

  const userInitials = useMemo(() => {
    const jwt = getJwt();
    if (!jwt) return '?';
    const payload = parseJwt(jwt);
    const name = (payload?.username ?? payload?.sub ?? '') as string;
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchSessionCount().then(setActiveStreamCount);
    const interval = setInterval(() => fetchSessionCount().then(setActiveStreamCount), 10000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Clear search when navigating to a different route
  useEffect(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const data = await gqlFetch<{ search: SearchItem[] }>(
          SEARCH_QUERY,
          { name: searchQuery.trim() },
        );
        setSearchResults(data.search ?? []);
      } catch {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  function handleLogout() {
    clearAuth();
    navigate('/', { replace: true });
  }

  return (
    <div className="dashboard">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <img className="logo" src={`${import.meta.env.BASE_URL}logo-square.svg`} alt="Astria" onLoad={e => e.currentTarget.classList.add('loaded')} />
        <nav>
          <button className={`nav-btn${location.pathname === '/dashboard' ? ' active' : ''}`} title="Home" onClick={() => navigate('/dashboard')}>
            <HomeIcon />
          </button>
          <button className={`nav-btn${location.pathname === '/movies' ? ' active' : ''}`} title="Movies" onClick={() => navigate('/movies')}>
            <FilmIcon />
          </button>
          <button className={`nav-btn${location.pathname === '/series' ? ' active' : ''}`} title="TV Shows" onClick={() => navigate('/series')}>
            <TvIcon />
          </button>
          <button className={`nav-btn${location.pathname === '/watchlist' ? ' active' : ''}`} title="Watchlist" onClick={() => navigate('/watchlist')}>
            <BookmarkIcon />
          </button>
          {isAdmin && (
            <button className={`nav-btn${location.pathname === '/unmatched' ? ' active' : ''}`} title="Unmatched Media" onClick={() => navigate('/unmatched')}>
              <FilePlusIcon />
            </button>
          )}
          {isAdmin && (
            <button className={`nav-btn${location.pathname === '/streams' ? ' active' : ''}`} title="Active Streams" onClick={() => navigate('/streams')}>
              <StreamIcon />
              {activeStreamCount > 0 && <span className="nav-badge">{activeStreamCount}</span>}
            </button>
          )}
          {isAdmin && (
            <button className={`nav-btn${location.pathname === '/admin' ? ' active' : ''}`} title="Admin Settings" onClick={() => navigate('/admin')}>
              <SettingsIcon />
            </button>
          )}
        </nav>
        <div className="avatar" title="User">{userInitials}</div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          {showBack || searchResults !== null ? (
            <button className="back-btn" onClick={() => {
              if (searchResults !== null) {
                setSearchQuery('');
                setSearchResults(null);
              } else {
                navigate(-1);
              }
            }}>
              <ChevronLeftIcon />
            </button>
          ) : (
            <div className="topbar-spacer" />
          )}
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search movies, shows…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="notif-btn" onClick={handleLogout} title="Sign out">
            <LogoutIcon />
          </button>
        </div>

        {/* Search Results Overlay */}
        {searchResults !== null && (
          <section className="search-overlay">
            <div className="search-overlay-header">
              <div className="search-overlay-info">
                <h2 className="search-overlay-title">Results for &ldquo;{searchQuery}&rdquo;</h2>
                <span className="search-overlay-count">{searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}</span>
              </div>
              <button className="search-overlay-close" onClick={() => { setSearchQuery(''); setSearchResults(null); }}>
                <CloseIcon />
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="search-empty">
                <SearchIcon strokeWidth={1.5} />
                <p>No results found</p>
                <span>Try a different search term</span>
              </div>
            ) : (
              <div className="search-grid">
                {searchResults.map(item => {
                  const isMovie = item.__typename === 'Movie';
                  const m = item as Movie;
                  const s = item as unknown as Series;
                  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };
                  return (
                    <PosterCard
                      key={isMovie ? m.uuid : s.uuid}
                      posterUrl={isMovie ? m.posterURL : tmdbImg(s.posterPath, 'w300')}
                      title={isMovie ? m.title : s.name}
                      subtitle={isMovie ? m.year : s.firstAirDate?.substring(0, 4)}
                      badge={isMovie ? 'Movie' : 'Series'}
                      detailPath={isMovie ? `/movie/${m.uuid}` : `/series/${s.uuid}`}
                      mediaType={isMovie ? 'movie' : 'series'}
                      mediaUuid={isMovie ? m.uuid : s.uuid}
                      onNavigate={clearSearch}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Page content (hidden when search results visible) */}
        {searchResults === null && children}
      </main>
    </div>
  );
}
