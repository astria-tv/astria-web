import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

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
  const jwt = sessionStorage.getItem('jwt');
  const res = await fetch('/olaris/m/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[] | null>(null);
  const showBack = location.pathname !== '/dashboard';

  const isAdmin = useMemo(() => {
    const jwt = sessionStorage.getItem('jwt');
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  }, []);

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
    sessionStorage.removeItem('jwt');
    navigate('/', { replace: true });
  }

  return (
    <div className="dashboard">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <img className="logo" src="/logo-square.svg" alt="Astria" onLoad={e => e.currentTarget.classList.add('loaded')} />
        <nav>
          <button className={`nav-btn${location.pathname === '/dashboard' ? ' active' : ''}`} title="Home" onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <button className={`nav-btn${location.pathname === '/movies' ? ' active' : ''}`} title="Movies" onClick={() => navigate('/movies')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>
          </button>
          <button className={`nav-btn${location.pathname === '/series' ? ' active' : ''}`} title="TV Shows" onClick={() => navigate('/series')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
          </button>
          {isAdmin && (
            <button className={`nav-btn${location.pathname === '/admin' ? ' active' : ''}`} title="Admin Settings" onClick={() => navigate('/admin')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          )}
        </nav>
        <div className="avatar" onClick={handleLogout} title="Sign out">CK</div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          {showBack ? (
            <button className="back-btn" onClick={() => navigate(-1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          ) : (
            <div className="topbar-spacer" />
          )}
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search movies, shows…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="notif-btn" onClick={handleLogout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="search-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p>No results found</p>
                <span>Try a different search term</span>
              </div>
            ) : (
              <div className="search-grid">
                {searchResults.map(item => {
                  const isMovie = item.__typename === 'Movie';
                  const m = item as Movie;
                  const s = item as unknown as Series;
                  return (
                    <div
                      className="search-card"
                      key={isMovie ? m.uuid : s.uuid}
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                        if (isMovie) {
                          navigate(`/movie/${m.uuid}`);
                        } else {
                          navigate(`/series/${s.uuid}`);
                        }
                      }}
                    >
                      <div className="search-card-poster">
                        {isMovie && m.posterURL ? (
                          <img src={m.posterURL} alt={m.title} onLoad={e => e.currentTarget.classList.add('loaded')} />
                        ) : !isMovie && s.posterPath ? (
                          <img src={tmdbImg(s.posterPath, 'w300')} alt={s.name} onLoad={e => e.currentTarget.classList.add('loaded')} />
                        ) : null}
                        <div className="search-card-overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <span className="search-card-type">{isMovie ? 'Movie' : 'Series'}</span>
                      </div>
                      <div className="search-card-info">
                        <div className="search-card-title">{isMovie ? m.title : s.name}</div>
                        <div className="search-card-year">{isMovie ? m.year : s.firstAirDate?.substring(0, 4)}</div>
                      </div>
                    </div>
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
