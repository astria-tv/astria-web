import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

/* ─── Types ─── */
interface PlayState {
  finished: boolean;
  playtime: number;
}

interface MovieFile {
  totalDuration: number | null;
}

interface Movie {
  __typename: 'Movie';
  title: string;
  original_title: string;
  year: string;
  overview: string;
  posterURL: string;
  backdropPath: string;
  uuid: string;
  playState: PlayState | null;
  files: MovieFile[];
}

interface Season {
  name: string;
  seasonNumber: number;
  posterPath: string;
  series: { name: string; uuid: string; posterPath: string } | null;
}

interface EpisodeFile {
  totalDuration: number | null;
}

interface Episode {
  __typename: 'Episode';
  name: string;
  overview: string;
  stillPath: string;
  episodeNumber: number;
  uuid: string;
  playState: PlayState | null;
  season: Season | null;
  files: EpisodeFile[];
}

type MediaItem = Movie | Episode;

interface Series {
  __typename: 'Series';
  name: string;
  overview: string;
  posterPath: string;
  backdropPath: string;
  uuid: string;
  firstAirDate: string;
  unwatchedEpisodesCount: number;
}

interface MediaStats {
  movieCount: number;
  seriesCount: number;
  seasonCount: number;
  episodeCount: number;
}

/* ─── GraphQL Queries ─── */
const DASHBOARD_QUERY = `{
  movies(limit: 20, sort: title) {
    title
    original_title
    year
    overview
    posterURL(width: 300)
    backdropPath
    uuid
    playState { finished playtime }
    files { totalDuration }
  }
  series(limit: 20, sort: name) {
    name
    overview
    posterPath
    backdropPath
    uuid
    firstAirDate
    unwatchedEpisodesCount
  }
  recentlyAdded {
    __typename
    ... on Movie {
      title
      year
      posterURL(width: 300)
      uuid
      playState { finished playtime }
    }
    ... on Episode {
      name
      episodeNumber
      stillPath
      uuid
      playState { finished playtime }
      season { seasonNumber posterPath series { name uuid posterPath } }
    }
  }
  upNext {
    __typename
    ... on Movie {
      title
      year
      overview
      posterURL(width: 300)
      backdropPath
      uuid
      playState { finished playtime }
      files { totalDuration }
    }
    ... on Episode {
      name
      episodeNumber
      stillPath
      uuid
      playState { finished playtime }
      season { seasonNumber series { name uuid } }
      files { totalDuration }
    }
  }
  mediaStats {
    movieCount
    seriesCount
    seasonCount
    episodeCount
  }
}`;



/* ─── Helpers ─── */
function tmdbImg(path: string, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function progressPercent(item: MediaItem): number {
  if (!item.playState || item.playState.finished) return 0;
  const duration =
    item.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.round((item.playState.playtime / duration) * 100));
}

function cwLabel(item: MediaItem): string {
  if (item.__typename === 'Episode') {
    const ep = item as Episode;
    const seriesName = ep.season?.series?.name ?? '';
    const s = ep.season?.seasonNumber ?? 0;
    const e = ep.episodeNumber;
    return `${seriesName} · S${s} E${e}`;
  }
  return (item as Movie).title;
}

function cwSub(item: MediaItem): string {
  if (!item.playState || item.playState.finished) return '';
  const duration = item.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return '';
  const remaining = duration - item.playState.playtime;
  return `${formatDuration(remaining)} left`;
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

/* ─── Component ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [upNext, setUpNext] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroItem, setHeroItem] = useState<Movie | Series | null>(null);

  const isAdmin = (() => {
    const jwt = sessionStorage.getItem('jwt');
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  })();

  const isEmpty = !loading && movies.length === 0 && series.length === 0 && recentlyAdded.length === 0;


  const fetchData = useCallback(async () => {
    try {
      const data = await gqlFetch<{
        movies: Movie[];
        series: Series[];
        recentlyAdded: MediaItem[];
        upNext: MediaItem[];
        mediaStats: MediaStats;
      }>(DASHBOARD_QUERY);

      setMovies(data.movies);
      setSeries(data.series);
      setRecentlyAdded(data.recentlyAdded ?? []);
      setUpNext(data.upNext ?? []);
      setStats(data.mediaStats);

      // Pick a random movie or series with a backdrop for the hero
      const moviesWithBackdrop = data.movies.filter(m => m.backdropPath);
      const seriesWithBackdrop = data.series.filter(s => s.backdropPath);
      const allWithBackdrop: (Movie | Series)[] = [
        ...moviesWithBackdrop.map(m => ({ ...m, __typename: 'Movie' as const })),
        ...seriesWithBackdrop.map(s => ({ ...s, __typename: 'Series' as const })),
      ];
      if (allWithBackdrop.length > 0) {
        setHeroItem(allWithBackdrop[Math.floor(Math.random() * allWithBackdrop.length)]);
      } else if (data.movies.length > 0) {
        setHeroItem({ ...data.movies[0], __typename: 'Movie' as const });
      } else if (data.series.length > 0) {
        setHeroItem({ ...data.series[0], __typename: 'Series' as const });
      }
    } catch {
      // silently fail — sections will just be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);



  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <>
        {/* Empty State Hero */}
        <section className="empty-hero">
          <div className="empty-hero-bg">
            <div className="empty-hero-orb orb-1" />
            <div className="empty-hero-orb orb-2" />
            <div className="empty-hero-orb orb-3" />
          </div>
          <div className="empty-hero-content">
            <div className="empty-hero-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
            </div>
            <h1 className="empty-hero-title">Welcome to Astria</h1>
            <p className="empty-hero-subtitle">
              Your media server is ready. {isAdmin ? 'Let\'s get your library set up.' : 'Media will appear here once your admin adds some content.'}
            </p>
          </div>
        </section>

        {/* Stats Strip — zeros shown contextually */}
        {stats && (
          <div className="activity-strip">
            <div className="activity-card">
              <div className="activity-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              </div>
              <div className="activity-text">
                <h4>{stats.movieCount.toLocaleString()}</h4>
                <p>Movies</p>
              </div>
            </div>
            <div className="activity-card">
              <div className="activity-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
              </div>
              <div className="activity-text">
                <h4>{stats.seriesCount.toLocaleString()}</h4>
                <p>TV Series</p>
              </div>
            </div>
            <div className="activity-card">
              <div className="activity-icon amber">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
              <div className="activity-text">
                <h4>{stats.episodeCount.toLocaleString()}</h4>
                <p>Episodes</p>
              </div>
            </div>
          </div>
        )}

        {/* Getting Started Steps (admin only) */}
        {isAdmin && (
          <section className="section empty-steps-section">
            <div className="section-header">
              <h2 className="section-title">Getting Started</h2>
            </div>
            <div className="empty-steps">
              <div className="empty-step-card">
                <div className="empty-step-number">1</div>
                <div className="empty-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <h3>Add Media Folders</h3>
                <p>Point Astria to directories containing your movies and TV shows.</p>
              </div>
              <div className="empty-step-card">
                <div className="empty-step-number">2</div>
                <div className="empty-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </div>
                <h3>Scan &amp; Match</h3>
                <p>Astria will scan your files and fetch metadata like posters and descriptions.</p>
              </div>
              <div className="empty-step-card">
                <div className="empty-step-number">3</div>
                <div className="empty-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <h3>Start Watching</h3>
                <p>Browse, search, and stream your entire library from any device.</p>
              </div>
            </div>
            <div className="empty-cta">
              <button className="btn btn-play" onClick={() => navigate('/admin?tab=libraries')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Open Admin Settings
              </button>
            </div>
          </section>
        )}

        {/* Non-admin empty state */}
        {!isAdmin && (
          <section className="section empty-waiting-section">
            <div className="empty-waiting-card">
              <div className="empty-waiting-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3>Content is on its way</h3>
              <p>Your admin is setting up the media library. Check back soon!</p>
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
        {/* Hero */}
        {heroItem && (() => {
          const isMovie = heroItem.__typename === 'Movie';
          const heroMovie = isMovie ? heroItem as Movie : null;
          const heroSeries = !isMovie ? heroItem as Series : null;
          const backdrop = isMovie ? heroMovie!.backdropPath : heroSeries!.backdropPath;
          const title = isMovie ? heroMovie!.title : heroSeries!.name;
          const year = isMovie ? heroMovie!.year : heroSeries!.firstAirDate?.substring(0, 4);
          const overview = isMovie ? heroMovie!.overview : heroSeries!.overview;
          const duration = isMovie ? heroMovie!.files?.[0]?.totalDuration : null;
          const detailPath = isMovie ? `/movie/${heroMovie!.uuid}` : `/series/${heroSeries!.uuid}`;

          return (
            <section className="hero">
              <div className="hero-bg">
                {backdrop && (
                  <img
                    className="hero-bg-img"
                    src={tmdbImg(backdrop, 'original')}
                    alt=""
                    onLoad={e => e.currentTarget.classList.add('loaded')}
                  />
                )}
                <div className="shimmer" />
              </div>
              <div className="hero-content">
                <div className="hero-badge">{isMovie ? 'Featured Film' : 'Featured Series'}</div>
                <h1 className="hero-title">{title}</h1>
                <div className="hero-meta">
                  {year && <span>{year}</span>}
                  {duration && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(duration)}</span>
                    </>
                  )}
                </div>
                <p className="hero-desc">{overview}</p>
                <div className="hero-actions">
                  <button className="btn btn-play">
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play
                  </button>
                  <button className="btn btn-ghost" onClick={() => navigate(detailPath)}>More Info</button>
                </div>
              </div>
            </section>
          );
        })()}

            {/* Continue Watching / Up Next */}
            {upNext.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title">Continue Watching</h2>
                </div>
                <div className="media-row">
                  {upNext.map(item => (
                    <div className="cw-card" key={item.uuid} onClick={() => {
                      if (item.__typename === 'Movie') {
                        navigate(`/movie/${item.uuid}`);
                      } else if (item.__typename === 'Episode') {
                        const ep = item as Episode;
                        const seriesUuid = ep.season?.series?.uuid;
                        if (seriesUuid) {
                          navigate(`/series/${seriesUuid}?season=${ep.season?.seasonNumber ?? 1}`);
                        }
                      }
                    }} style={{ cursor: 'pointer' }}>
                      <div className="cw-thumb">
                        {item.__typename === 'Movie' && (item as Movie).posterURL && (
                          <img src={(item as Movie).posterURL} alt="" className="cw-thumb-img" onLoad={e => e.currentTarget.classList.add('loaded')} />
                        )}
                        {item.__typename === 'Episode' && (item as Episode).stillPath && (
                          <img src={tmdbImg((item as Episode).stillPath)} alt="" className="cw-thumb-img" onLoad={e => e.currentTarget.classList.add('loaded')} />
                        )}
                        <div className="play-overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div className="cw-progress">
                          <div className="cw-progress-bar" style={{ width: `${progressPercent(item)}%` }} />
                        </div>
                      </div>
                      <div className="cw-info">
                        <h3>{cwLabel(item)}</h3>
                        <p>{cwSub(item)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Stats Strip */}
            {stats && (
              <div className="activity-strip">
                <div className="activity-card">
                  <div className="activity-icon green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                  </div>
                  <div className="activity-text">
                    <h4>{stats.movieCount.toLocaleString()}</h4>
                    <p>Movies</p>
                  </div>
                </div>
                <div className="activity-card">
                  <div className="activity-icon blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                  </div>
                  <div className="activity-text">
                    <h4>{stats.seriesCount.toLocaleString()}</h4>
                    <p>TV Series</p>
                  </div>
                </div>
                <div className="activity-card">
                  <div className="activity-icon amber">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                  <div className="activity-text">
                    <h4>{stats.episodeCount.toLocaleString()}</h4>
                    <p>Episodes</p>
                  </div>
                </div>
              </div>
            )}

            {/* Recently Added */}
            {recentlyAdded.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title">Recently Added</h2>
                </div>
                <div className="media-row">
                  {recentlyAdded.map(item => {
                    const isMovie = item.__typename === 'Movie';
                    const movie = item as Movie;
                    const episode = item as Episode;
                    return (
                      <div className="poster-card" key={item.uuid} onClick={() => {
                        if (isMovie) {
                          navigate(`/movie/${movie.uuid}`);
                        } else {
                          const seriesUuid = episode.season?.series?.uuid;
                          if (seriesUuid) {
                            navigate(`/series/${seriesUuid}?season=${episode.season?.seasonNumber ?? 1}`);
                          }
                        }
                      }} style={{ cursor: 'pointer' }}>
                        <div className="poster">
                          {isMovie && movie.posterURL ? (
                            <img src={movie.posterURL} alt={movie.title} onLoad={e => e.currentTarget.classList.add('loaded')} />
                          ) : !isMovie ? (
                            <img src={tmdbImg((episode.season?.posterPath || episode.season?.series?.posterPath) ?? '', 'w300')} alt={episode.name} onLoad={e => e.currentTarget.classList.add('loaded')} />
                          ) : null}
                          <span className="badge-new">New</span>
                          <div className="overlay">
                            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                        </div>
                        <div className="p-title">
                          {isMovie ? movie.title : `${episode.season?.series?.name ?? ''}`}
                        </div>
                        <div className="p-year">
                          {isMovie
                            ? movie.year
                            : `S${episode.season?.seasonNumber ?? '?'} E${episode.episodeNumber}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Movies */}
            {movies.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title">Movies</h2>
                  <span className="section-link" onClick={() => navigate('/movies')} style={{ cursor: 'pointer' }}>See all →</span>
                </div>
                <div className="media-row">
                  {movies.map(movie => (
                    <div className="poster-card" key={movie.uuid} onClick={() => navigate(`/movie/${movie.uuid}`)} style={{ cursor: 'pointer' }}>
                      <div className="poster">
                        {movie.posterURL && <img src={movie.posterURL} alt={movie.title} onLoad={e => e.currentTarget.classList.add('loaded')} />}
                        <div className="overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      </div>
                      <div className="p-title">{movie.title}</div>
                      <div className="p-year">{movie.year}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* TV Series */}
            {series.length > 0 && (
              <section className="section" style={{ paddingBottom: 60 }}>
                <div className="section-header">
                  <h2 className="section-title">TV Series</h2>
                  <span className="section-link" onClick={() => navigate('/series')} style={{ cursor: 'pointer' }}>See all →</span>
                </div>
                <div className="media-row">
                  {series.map(s => (
                    <div className="poster-card" key={s.uuid} onClick={() => navigate(`/series/${s.uuid}`)} style={{ cursor: 'pointer' }}>
                      <div className="poster">
                        {s.posterPath && <img src={tmdbImg(s.posterPath, 'w300')} alt={s.name} onLoad={e => e.currentTarget.classList.add('loaded')} />}
                        <div className="overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        {s.unwatchedEpisodesCount > 0 && (
                          <span className="badge-new">{s.unwatchedEpisodesCount} new</span>
                        )}
                      </div>
                      <div className="p-title">{s.name}</div>
                      <div className="p-year">{s.firstAirDate?.substring(0, 4)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
    </>
  );
}
