import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import './SeriesDetails.css';

/* ─── Types ─── */
interface PlayState {
  finished: boolean;
  playtime: number;
}

interface Stream {
  codecName: string | null;
  codecMime: string | null;
  profile: string | null;
  bitRate: number | null;
  streamType: string | null;
  language: string | null;
  title: string | null;
  resolution: string | null;
  totalDuration: number | null;
}

interface EpisodeFile {
  fileName: string;
  filePath: string;
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: Stream[];
}

interface Episode {
  name: string;
  overview: string;
  stillPath: string;
  airDate: string;
  episodeNumber: number;
  tmdbID: number;
  uuid: string;
  files: EpisodeFile[];
  playState: PlayState | null;
}

interface Season {
  name: string;
  overview: string;
  seasonNumber: number;
  airDate: string;
  posterPath: string;
  tmdbID: number;
  episodes: Episode[];
  uuid: string;
  unwatchedEpisodesCount: number;
}

interface Series {
  name: string;
  originalName: string;
  overview: string;
  firstAirDate: string;
  status: string;
  seasons: Season[];
  backdropPath: string;
  posterPath: string;
  tmdbID: number;
  uuid: string;
  unwatchedEpisodesCount: number;
}

/* ─── Query ─── */
const SERIES_DETAIL_QUERY = `query SeriesDetail($uuid: String!) {
  series(uuid: $uuid) {
    name
    originalName
    overview
    firstAirDate
    status
    backdropPath
    posterPath
    tmdbID
    uuid
    unwatchedEpisodesCount
    seasons {
      name
      overview
      seasonNumber
      airDate
      posterPath
      tmdbID
      uuid
      unwatchedEpisodesCount
      episodes {
        name
        overview
        stillPath
        airDate
        episodeNumber
        tmdbID
        uuid
        playState { finished playtime }
        files {
          fileName
          filePath
          uuid
          totalDuration
          fileSize
          streams {
            codecName
            codecMime
            profile
            bitRate
            streamType
            language
            title
            resolution
            totalDuration
          }
        }
      }
    }
  }
}`;

/* ─── Mutations ─── */
const CREATE_PLAY_STATE = `mutation CreatePlayState($uuid: String!, $finished: Boolean!, $playtime: Float!) {
  createPlayState(uuid: $uuid, finished: $finished, playtime: $playtime) {
    uuid
    playState { finished playtime }
  }
}`;

/* ─── Helpers ─── */
function tmdbImg(path: string, size = 'original'): string {
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

function episodeProgress(ep: Episode): number {
  if (!ep.playState || ep.playState.finished) return 0;
  const duration = ep.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.round((ep.playState.playtime / duration) * 100));
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

/* ─── Component ─── */
export default function SeriesDetails() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState(0);
  const [togglingEpisodes, setTogglingEpisodes] = useState<Set<string>>(new Set());
  const [togglingSeason, setTogglingSeason] = useState(false);
  const [togglingSeries, setTogglingSeries] = useState(false);

  useEffect(() => {
    if (!uuid) return;
    setLoading(true);
    gqlFetch<{ series: Series[] }>(SERIES_DETAIL_QUERY, { uuid })
      .then(data => {
        if (data.series.length > 0) {
          const s = data.series[0];
          setSeries(s);
          // Check for season query param, otherwise default to first season with episodes
          const seasonParam = searchParams.get('season');
          if (seasonParam != null) {
            const seasonNum = parseInt(seasonParam, 10);
            const idx = s.seasons.findIndex(sn => sn.seasonNumber === seasonNum);
            setActiveSeason(idx >= 0 ? idx : 0);
          } else {
            const idx = s.seasons.findIndex(sn => sn.episodes.length > 0);
            setActiveSeason(idx >= 0 ? idx : 0);
          }
        } else {
          setError('Series not found');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [uuid]);

  async function toggleEpisodeWatched(ep: Episode, e: React.MouseEvent) {
    e.stopPropagation();
    if (togglingEpisodes.has(ep.uuid)) return;
    const isWatched = ep.playState?.finished ?? false;
    setTogglingEpisodes(prev => new Set(prev).add(ep.uuid));
    try {
      await gqlFetch(CREATE_PLAY_STATE, {
        uuid: ep.uuid,
        finished: !isWatched,
        playtime: 0,
      });
      setSeries(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          unwatchedEpisodesCount: prev.unwatchedEpisodesCount + (isWatched ? 1 : -1),
          seasons: prev.seasons.map(s => ({
            ...s,
            unwatchedEpisodesCount: s.episodes.some(e => e.uuid === ep.uuid)
              ? s.unwatchedEpisodesCount + (isWatched ? 1 : -1)
              : s.unwatchedEpisodesCount,
            episodes: s.episodes.map(e =>
              e.uuid === ep.uuid
                ? { ...e, playState: { finished: !isWatched, playtime: 0 } }
                : e
            ),
          })),
        };
      });
    } catch (err) {
      console.error('Failed to toggle episode watched state:', err);
    } finally {
      setTogglingEpisodes(prev => {
        const next = new Set(prev);
        next.delete(ep.uuid);
        return next;
      });
    }
  }

  async function toggleSeasonWatched(seasonIdx: number) {
    if (!series || togglingSeason) return;
    const season = series.seasons[seasonIdx];
    const allWatched = season.episodes.every(ep => ep.playState?.finished);
    const targetFinished = !allWatched;
    setTogglingSeason(true);
    try {
      await Promise.all(
        season.episodes.map(ep =>
          gqlFetch(CREATE_PLAY_STATE, {
            uuid: ep.uuid,
            finished: targetFinished,
            playtime: 0,
          })
        )
      );
      setSeries(prev => {
        if (!prev) return prev;
        const epUuids = new Set(season.episodes.map(e => e.uuid));
        const countDelta = season.episodes.reduce((sum, ep) => {
          const was = ep.playState?.finished ?? false;
          if (was !== targetFinished) return sum + (targetFinished ? -1 : 1);
          return sum;
        }, 0);
        return {
          ...prev,
          unwatchedEpisodesCount: prev.unwatchedEpisodesCount + countDelta,
          seasons: prev.seasons.map((s, i) => i !== seasonIdx ? s : ({
            ...s,
            unwatchedEpisodesCount: targetFinished ? 0 : s.episodes.length,
            episodes: s.episodes.map(e =>
              epUuids.has(e.uuid)
                ? { ...e, playState: { finished: targetFinished, playtime: 0 } }
                : e
            ),
          })),
        };
      });
    } catch (err) {
      console.error('Failed to toggle season watched state:', err);
    } finally {
      setTogglingSeason(false);
    }
  }

  async function toggleSeriesWatched() {
    if (!series || togglingSeries) return;
    const allWatched = series.seasons
      .flatMap(s => s.episodes)
      .every(ep => ep.playState?.finished);
    const targetFinished = !allWatched;
    setTogglingSeries(true);
    try {
      const allEps = series.seasons.flatMap(s => s.episodes);
      await Promise.all(
        allEps.map(ep =>
          gqlFetch(CREATE_PLAY_STATE, {
            uuid: ep.uuid,
            finished: targetFinished,
            playtime: 0,
          })
        )
      );
      setSeries(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          unwatchedEpisodesCount: targetFinished ? 0 : prev.seasons.flatMap(s => s.episodes).length,
          seasons: prev.seasons.map(s => ({
            ...s,
            unwatchedEpisodesCount: targetFinished ? 0 : s.episodes.length,
            episodes: s.episodes.map(e => ({
              ...e,
              playState: { finished: targetFinished, playtime: 0 },
            })),
          })),
        };
      });
    } catch (err) {
      console.error('Failed to toggle series watched state:', err);
    } finally {
      setTogglingSeries(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state"><div className="spinner" /></div>
    );
  }

  if (error || !series) {
    return (
      <div className="error-state">
        <p>{error ?? 'Series not found'}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  const season = series.seasons[activeSeason];
  const year = series.firstAirDate?.substring(0, 4);
  const totalEpisodes = series.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  const totalSeasons = series.seasons.length;

  return (
    <>
      {/* Backdrop */}
      <section className="backdrop">
        <div className="backdrop-img">
          {series.backdropPath && (
            <img src={tmdbImg(series.backdropPath, 'original')} alt="" onLoad={e => e.currentTarget.classList.add('loaded')} />
          )}
        </div>
      </section>

      {/* Detail Content */}
      <div className="detail-content">
        <div className="detail-poster">
          {series.posterPath && <img src={tmdbImg(series.posterPath, 'w500')} alt={series.name} onLoad={e => e.currentTarget.classList.add('loaded')} />}
        </div>

        <div className="detail-info">
          <h1>{series.name}</h1>
          {series.originalName && series.originalName !== series.name && (
            <p className="original-title">{series.originalName}</p>
          )}

          <div className="meta-row">
            {year && <span>{year}</span>}
            <span>•</span>
            <span>{totalSeasons} Season{totalSeasons !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{totalEpisodes} Episode{totalEpisodes !== 1 ? 's' : ''}</span>
            {series.status && (
              <>
                <span>•</span>
                <span className="status-badge">{series.status}</span>
              </>
            )}
            {series.unwatchedEpisodesCount > 0 && (
              <span className="unwatched-badge">
                {series.unwatchedEpisodesCount} unwatched
              </span>
            )}
            {(() => {
              const allSeriesWatched = series.seasons
                .flatMap(s => s.episodes)
                .every(ep => ep.playState?.finished);
              return (
                <button
                  className={`btn-series-toggle${allSeriesWatched ? ' active' : ''}`}
                  onClick={toggleSeriesWatched}
                  disabled={togglingSeries}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                  {togglingSeries ? 'Updating…' : allSeriesWatched ? 'Series Watched' : 'Mark All Watched'}
                </button>
              );
            })()}
          </div>

          <div className="synopsis">
            <h3>Synopsis</h3>
            <p>{series.overview || 'No synopsis available.'}</p>
          </div>

          {/* Season Tabs */}
          {series.seasons.length > 0 && (
            <div className="seasons-section">
              <div className="season-tabs-row">
                <div className="season-tabs">
                  {series.seasons.map((s, i) => (
                    <button
                      key={s.uuid}
                      className={`season-tab ${i === activeSeason ? 'active' : ''}`}
                      onClick={() => setActiveSeason(i)}
                    >
                      {s.name || `Season ${s.seasonNumber}`}
                      {s.unwatchedEpisodesCount > 0 && (
                        <span className="tab-badge">{s.unwatchedEpisodesCount}</span>
                      )}
                    </button>
                  ))}
                </div>
                {season && (() => {
                  const allSeasonWatched = season.episodes.length > 0 && season.episodes.every(ep => ep.playState?.finished);
                  return (
                    <button
                      className={`btn-season-toggle${allSeasonWatched ? ' active' : ''}`}
                      onClick={() => toggleSeasonWatched(activeSeason)}
                      disabled={togglingSeason || season.episodes.length === 0}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      {togglingSeason ? 'Updating…' : allSeasonWatched ? 'Season Watched' : 'Mark Season Watched'}
                    </button>
                  );
                })()}
              </div>

              {/* Season Overview */}
              {season && (
                <div className="season-content">
                  {season.overview && (
                    <p className="season-overview">{season.overview}</p>
                  )}

                  {/* Episode List */}
                  <div className="episode-list">
                    {season.episodes.map(ep => {
                      const progress = episodeProgress(ep);
                      const duration = ep.files?.[0]?.totalDuration;
                      const isWatched = ep.playState?.finished;
                      return (
                        <div
                          className={`episode-card ${isWatched ? 'watched' : ''}`}
                          key={ep.uuid}
                          style={{ cursor: ep.files?.[0] ? 'pointer' : undefined }}
                          onClick={() => {
                            const epFile = ep.files?.[0];
                            if (!epFile) return;
                            navigate(`/play/${epFile.uuid}`, {
                              state: {
                                title: ep.name,
                                subtitle: `${series.name} · ${season.name} · E${ep.episodeNumber}`,
                                mediaUuid: ep.uuid,
                                startTime: ep.playState?.finished ? 0 : (ep.playState?.playtime ?? 0),
                              },
                            });
                          }}
                        >
                          <div className="episode-thumb">
                            {ep.stillPath ? (
                              <img src={tmdbImg(ep.stillPath, 'w300')} alt="" onLoad={e => e.currentTarget.classList.add('loaded')} />
                            ) : (
                              <div className="episode-thumb-placeholder">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="2" y="2" width="20" height="20" rx="2" />
                                  <polygon points="10 8 16 12 10 16 10 8" />
                                </svg>
                              </div>
                            )}
                            <div className="episode-play-overlay">
                              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            </div>
                            {progress > 0 && (
                              <div className="episode-progress">
                                <div className="episode-progress-bar" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                          </div>
                          <div className="episode-info">
                            <div className="episode-header">
                              <span className="episode-number">E{ep.episodeNumber}</span>
                              <h4 className="episode-title">{ep.name}</h4>
                              {progress > 0 && !isWatched && (
                                <span className="progress-label">
                                  {formatDuration((duration ?? 0) - (ep.playState?.playtime ?? 0))} left
                                </span>
                              )}
                              {duration != null && duration > 0 && (
                                <span className="episode-duration">{formatDuration(duration)}</span>
                              )}
                              <button
                                className={`btn-episode-toggle${isWatched ? ' active' : ''}`}
                                onClick={(e) => toggleEpisodeWatched(ep, e)}
                                disabled={togglingEpisodes.has(ep.uuid)}
                                title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                              </button>
                            </div>
                            {ep.overview && (
                              <p className="episode-desc">{ep.overview}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {season.episodes.length === 0 && (
                      <p className="no-episodes">No episodes available for this season.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
