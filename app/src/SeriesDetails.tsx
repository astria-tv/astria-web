import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getJwt, parseJwt, handleAuthFailure } from './auth';
import './DetailPage.css';
import './SeriesDetails.css';
import Modal from './Modal';
import MediaInfoPanel from './MediaInfoPanel';
import {
  CheckIcon, MoreVerticalIcon, SearchIcon, PlayIcon,
  MediaPlayIcon, MonitorIcon, CloseIcon, ErrorCircleIcon,
  ImageIcon, InfoIcon,
  BookmarkIcon, BookmarkFilledIcon,
} from './Icons';

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

interface Person {
  name: string;
  profilePath: string;
  tmdbID: number;
}

interface CastRole {
  person: Person;
  character: string;
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
  onWatchlist: boolean;
  cast: CastRole[];
}

interface TmdbSeriesResult {
  name: string;
  firstAirYear: number | null;
  tmdbID: number;
  backdropPath: string;
  posterPath: string;
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
    onWatchlist
    cast {
      character
      person { name profilePath tmdbID }
    }
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
const ADD_TO_WATCHLIST = `mutation AddToWatchlist($mediaUUID: String!, $mediaType: String!) {
  addToWatchlist(mediaUUID: $mediaUUID, mediaType: $mediaType) { success }
}`;

const REMOVE_FROM_WATCHLIST = `mutation RemoveFromWatchlist($mediaUUID: String!) {
  removeFromWatchlist(mediaUUID: $mediaUUID) { success }
}`;

const CREATE_PLAY_STATE = `mutation CreatePlayState($uuid: String!, $finished: Boolean!, $playtime: Float!) {
  createPlayState(uuid: $uuid, finished: $finished, playtime: $playtime) {
    uuid
    playState { finished playtime }
  }
}`;

const TMDB_SEARCH_SERIES = `query ($query: String!) {
  tmdbSearchSeries(query: $query) {
    name firstAirYear tmdbID backdropPath posterPath
  }
}`;

const UPDATE_EPISODE_FILE = `mutation ($input: UpdateEpisodeFileMetadataInput!) {
  updateEpisodeFileMetadata(input: $input) {
    error { message hasError }
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
  const [togglingWatchlist, setTogglingWatchlist] = useState(false);

  // Episode file picker state (for episodes with multiple files)
  const [filePickerEp, setFilePickerEp] = useState<Episode | null>(null);

  // Episode media info modal state
  const [mediaInfoEp, setMediaInfoEp] = useState<Episode | null>(null);

  // Admin check
  const isAdmin = useMemo(() => {
    const jwt = getJwt();
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  }, []);

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fix match state
  const [showFixMatch, setShowFixMatch] = useState(false);
  const [fixEntireSeries, setFixEntireSeries] = useState(true);
  const [fixSelectedFileUUIDs, setFixSelectedFileUUIDs] = useState<Set<string>>(new Set());
  const [fixSearchQuery, setFixSearchQuery] = useState('');
  const [fixTmdbIdInput, setFixTmdbIdInput] = useState('');
  const [fixSeriesResults, setFixSeriesResults] = useState<TmdbSeriesResult[]>([]);
  const [fixSearching, setFixSearching] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState('');
  const [fixSuccess, setFixSuccess] = useState('');

  useEffect(() => {
    if (!uuid) return;
    setLoading(true);
    gqlFetch<{ series: Series[] }>(SERIES_DETAIL_QUERY, { uuid })
      .then(data => {
        if (data.series.length > 0) {
          const s = data.series[0];
          s.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
          s.seasons.forEach(sn => sn.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber));
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  function handleEpisodeClick(ep: Episode) {
    if (ep.files.length === 0) return;
    if (ep.files.length === 1) {
      const epFile = ep.files[0];
      navigate(`/play/${epFile.uuid}`, {
        state: {
          title: ep.name,
          subtitle: `${series!.name} · ${series!.seasons[activeSeason].name} · E${ep.episodeNumber}`,
          posterUrl: ep.stillPath ? tmdbImg(ep.stillPath, 'w342') : (series!.posterPath ? tmdbImg(series!.posterPath, 'w342') : undefined),
          mediaUuid: ep.uuid,
          episodeUuid: ep.uuid,
          startTime: ep.playState?.finished ? 0 : (ep.playState?.playtime ?? 0),
        },
      });
    } else {
      // Show file picker
      setFilePickerEp(ep);
    }
  }

  function playEpisodeFile(ep: Episode, f: EpisodeFile) {
    const vs = f.streams?.find(s => s.streamType === 'video');
    const res = vs?.resolution;
    navigate(`/play/${f.uuid}`, {
      state: {
        title: ep.name,
        subtitle: `${series!.name} · ${series!.seasons[activeSeason].name} · E${ep.episodeNumber}${res ? ` · ${res}` : ''}`,
        posterUrl: ep.stillPath ? tmdbImg(ep.stillPath, 'w342') : (series!.posterPath ? tmdbImg(series!.posterPath, 'w342') : undefined),
        mediaUuid: ep.uuid,
        episodeUuid: ep.uuid,
        startTime: ep.playState?.finished ? 0 : (ep.playState?.playtime ?? 0),
      },
    });
  }

  function formatFileSize(bytesStr: string): string {
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes) || bytes === 0) return '—';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  // TMDB search with debounce for fix match
  useEffect(() => {
    if (!fixSearchQuery.trim() || !showFixMatch) {
      setFixSeriesResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setFixSearching(true);
      try {
        const data = await gqlFetch<{ tmdbSearchSeries: TmdbSeriesResult[] }>(
          TMDB_SEARCH_SERIES,
          { query: fixSearchQuery.trim() },
        );
        setFixSeriesResults(data.tmdbSearchSeries ?? []);
      } catch {
        setFixSeriesResults([]);
      } finally {
        setFixSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [fixSearchQuery, showFixMatch]);

  function openFixMatch() {
    setDropdownOpen(false);
    setShowFixMatch(true);
    setFixEntireSeries(true);
    setFixSelectedFileUUIDs(new Set());
    setFixSearchQuery(series?.name ?? '');
    setFixTmdbIdInput('');
    setFixSeriesResults([]);
    setFixError('');
    setFixSuccess('');
  }

  function closeFixMatch() {
    setShowFixMatch(false);
    setFixEntireSeries(true);
    setFixSelectedFileUUIDs(new Set());
    setFixSearchQuery('');
    setFixTmdbIdInput('');
    setFixSeriesResults([]);
    setFixError('');
    setFixSuccess('');
  }

  async function doFixMatch(tmdbID: number) {
    if (!series) return;
    setFixing(true);
    setFixError('');
    setFixSuccess('');
    try {
      const input: Record<string, unknown> = { tmdbID };
      if (fixEntireSeries) {
        input.seriesUUID = series.uuid;
      } else {
        input.episodeFileUUID = Array.from(fixSelectedFileUUIDs);
      }
      const data = await gqlFetch<{
        updateEpisodeFileMetadata: { error: { message: string; hasError: boolean } | null };
      }>(UPDATE_EPISODE_FILE, { input });
      if (data.updateEpisodeFileMetadata.error?.hasError) {
        setFixError(data.updateEpisodeFileMetadata.error.message);
        return;
      }
      setFixSuccess('Match updated successfully!');
      setTimeout(() => {
        closeFixMatch();
        window.location.reload();
      }, 800);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Failed to update match');
    } finally {
      setFixing(false);
    }
  }

  function handleFixTmdbIdSubmit() {
    const id = parseInt(fixTmdbIdInput.trim(), 10);
    if (isNaN(id) || id <= 0) {
      setFixError('Please enter a valid TMDB ID');
      return;
    }
    if (!fixEntireSeries && fixSelectedFileUUIDs.size === 0) {
      setFixError('Please select at least one episode');
      return;
    }
    doFixMatch(id);
  }

  function handleFixResultClick(tmdbID: number) {
    if (!fixEntireSeries && fixSelectedFileUUIDs.size === 0) {
      setFixError('Please select at least one episode');
      return;
    }
    doFixMatch(tmdbID);
  }

  function toggleAllEpisodeFiles(checked: boolean) {
    if (!series) return;
    if (checked) {
      const allUUIDs = new Set<string>();
      for (const s of series.seasons) {
        for (const ep of s.episodes) {
          for (const f of ep.files) {
            allUUIDs.add(f.uuid);
          }
        }
      }
      setFixSelectedFileUUIDs(allUUIDs);
    } else {
      setFixSelectedFileUUIDs(new Set());
    }
  }

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

  async function toggleWatchlist() {
    if (!series || togglingWatchlist) return;
    setTogglingWatchlist(true);
    try {
      if (series.onWatchlist) {
        await gqlFetch(REMOVE_FROM_WATCHLIST, { mediaUUID: series.uuid });
      } else {
        await gqlFetch(ADD_TO_WATCHLIST, { mediaUUID: series.uuid, mediaType: 'series' });
      }
      setSeries(prev => prev ? { ...prev, onWatchlist: !prev.onWatchlist } : prev);
    } catch (err) {
      console.error('Failed to toggle watchlist:', err);
    } finally {
      setTogglingWatchlist(false);
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
                  <CheckIcon />
                  {togglingSeries ? 'Updating…' : allSeriesWatched ? 'Series Watched' : 'Mark All Watched'}
                </button>
              );
            })()}
            <button
              className={`btn-series-toggle${series.onWatchlist ? ' active' : ''}`}
              onClick={toggleWatchlist}
              disabled={togglingWatchlist}
              title={series.onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              {series.onWatchlist ? <BookmarkFilledIcon /> : <BookmarkIcon />}
            </button>
            {isAdmin && (
              <div className="admin-dropdown" ref={dropdownRef}>
                <button
                  className="btn-series-toggle admin-dropdown-toggle-inline"
                  onClick={() => setDropdownOpen(o => !o)}
                  title="More options"
                >
                  <MoreVerticalIcon width={14} height={14} />
                </button>
                {dropdownOpen && (
                  <div className="admin-dropdown-menu">
                    <button className="admin-dropdown-item" onClick={openFixMatch}>
                      <SearchIcon />
                      Fix Match
                    </button>
                  </div>
                )}
              </div>
            )}          </div>

          <div className="synopsis">
            <h3>Synopsis</h3>
            <p>{series.overview || 'No synopsis available.'}</p>
          </div>

          {series.cast.length > 0 && (
            <div className="cast-section">
              <h3>Cast</h3>
              <div className="cast-scroll">
                {series.cast.map(role => (
                  <div
                    className="cast-card cast-card-link"
                    key={`${role.person.tmdbID}-${role.character}`}
                    onClick={() => navigate(`/person/${role.person.tmdbID}`)}
                  >
                    <div className="cast-avatar">
                      {role.person.profilePath ? (
                        <img
                          src={role.person.profilePath}
                          alt={role.person.name}
                          onLoad={e => e.currentTarget.classList.add('loaded')}
                        />
                      ) : (
                        <div className="cast-avatar-placeholder">
                          {role.person.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className="cast-name">{role.person.name}</span>
                    <span className="cast-character">{role.character}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      <CheckIcon />
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
                      const hasMultiFiles = ep.files.length > 1;
                      return (
                        <div
                          className={`episode-card ${isWatched ? 'watched' : ''}`}
                          key={ep.uuid}
                          style={{ cursor: ep.files?.[0] ? 'pointer' : undefined }}
                          onClick={() => handleEpisodeClick(ep)}
                        >
                          <div className="episode-thumb">
                            {ep.stillPath ? (
                              <img src={tmdbImg(ep.stillPath, 'w300')} alt="" onLoad={e => e.currentTarget.classList.add('loaded')} />
                            ) : (
                              <div className="episode-thumb-placeholder">
                                <MediaPlayIcon strokeWidth={1.5} />
                              </div>
                            )}
                            <div className="episode-play-overlay">
                              <PlayIcon />
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
                              {hasMultiFiles && (
                                <span className="episode-multi-badge" title={`${ep.files.length} versions available`}>
                                  <MonitorIcon />
                                  {ep.files.length}
                                </span>
                              )}
                              <button
                                className="btn-episode-info"
                                onClick={(e) => { e.stopPropagation(); setMediaInfoEp(ep); }}
                                title="Media info"
                              >
                                <InfoIcon />
                              </button>
                              <button
                                className={`btn-episode-toggle${isWatched ? ' active' : ''}`}
                                onClick={(e) => toggleEpisodeWatched(ep, e)}
                                disabled={togglingEpisodes.has(ep.uuid)}
                                title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                              >
                                <CheckIcon />
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

      {/* Episode File Picker (for multi-file episodes) */}
      <Modal open={!!filePickerEp} onClose={() => setFilePickerEp(null)} className="fp-modal">
        {filePickerEp && (<>
            <div className="fp-header">
              <span className="fp-label">Choose Version</span>
              <span className="fp-title">E{filePickerEp.episodeNumber} · {filePickerEp.name}</span>
            </div>
            {[...filePickerEp.files]
              .sort((a, b) => {
                const resA = parseInt(a.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
                const resB = parseInt(b.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
                return resB - resA;
              })
              .map(f => {
                const vs = f.streams?.find(s => s.streamType === 'video');
                const res = vs?.resolution ?? 'Unknown';
                const codec = vs?.codecName?.toUpperCase() ?? '';
                const bitrate = vs?.bitRate ? `${Math.round(vs.bitRate / 1000)}k` : '';
                const size = formatFileSize(f.fileSize);
                return (
                  <button
                    key={f.uuid}
                    className="fp-option"
                    onClick={() => {
                      playEpisodeFile(filePickerEp, f);
                      setFilePickerEp(null);
                    }}
                  >
                    <PlayIcon className="fp-play-icon" />
                    <span className="fp-res">{res}</span>
                    <span className="fp-tags">
                      {codec && <span className="fp-tag">{codec}</span>}
                      {bitrate && <span className="fp-tag">{bitrate}</span>}
                    </span>
                    <span className="fp-size">{size}</span>
                  </button>
                );
              })}
        </>)}
      </Modal>

      {/* Fix Match Modal */}
      <Modal open={!!(showFixMatch && series)} onClose={closeFixMatch} className="um-panel fm-panel-wide">
        {showFixMatch && series && (<>
            <div className="um-panel-header">
              <div>
                <h2>Fix Match</h2>
                <p className="um-panel-filename">{series.name}</p>
              </div>
              <button className="um-panel-close" onClick={closeFixMatch}>
                <CloseIcon />
              </button>
            </div>

            {fixError && (
              <div className="admin-error" style={{ margin: '0 24px 12px' }}>
                <ErrorCircleIcon />
                {fixError}
              </div>
            )}

            {fixSuccess && (
              <div className="um-success" style={{ margin: '0 24px 12px' }}>
                <CheckIcon />
                {fixSuccess}
              </div>
            )}

            <div className="fm-body">
              {/* Left column: scope + TMDB ID */}
              <div className="fm-col-left">
                {/* Scope Selection */}
                <div className="fm-scope-section">
                  <label className="um-label">What to fix</label>
                  <div className="fm-scope-options">
                    <label className="fm-scope-option">
                      <input
                        type="radio"
                        name="fixScope"
                        checked={fixEntireSeries}
                        onChange={() => { setFixEntireSeries(true); setFixSelectedFileUUIDs(new Set()); }}
                      />
                      <span>Entire series</span>
                    </label>
                    <label className="fm-scope-option">
                      <input
                        type="radio"
                        name="fixScope"
                        checked={!fixEntireSeries}
                        onChange={() => setFixEntireSeries(false)}
                      />
                      <span>Select episodes</span>
                    </label>
                  </div>

                  {/* Episode selection list */}
                  {!fixEntireSeries && (
                    <div className="fm-episode-select">
                      <div className="fm-episode-select-header">
                        <label className="fm-select-all-label">
                          <input
                            type="checkbox"
                            checked={(() => {
                              const total = series.seasons.reduce((sum, s) => sum + s.episodes.reduce((es, ep) => es + ep.files.length, 0), 0);
                              return total > 0 && fixSelectedFileUUIDs.size === total;
                            })()}
                            onChange={e => toggleAllEpisodeFiles(e.target.checked)}
                          />
                          <span>Select all</span>
                        </label>
                        {fixSelectedFileUUIDs.size > 0 && (
                          <span className="fm-selected-count">{fixSelectedFileUUIDs.size} selected</span>
                        )}
                      </div>
                      <div className="fm-episode-list">
                        {series.seasons.map(s => (
                          <div key={s.uuid} className="fm-season-group">
                            <div className="fm-season-label">{s.name || `Season ${s.seasonNumber}`}</div>
                            {s.episodes.map(ep => {
                              const epFile = ep.files?.[0];
                              if (!epFile) return null;
                              return (
                                <label key={ep.uuid} className="fm-episode-item">
                                  <input
                                    type="checkbox"
                                    checked={fixSelectedFileUUIDs.has(epFile.uuid)}
                                    onChange={e => {
                                      setFixSelectedFileUUIDs(prev => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(epFile.uuid);
                                        else next.delete(epFile.uuid);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="fm-ep-number">E{ep.episodeNumber}</span>
                                  <span className="fm-ep-name">{ep.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* TMDB ID Input */}
                <div className="um-id-section">
                  <label className="um-label">TMDB ID</label>
                  <div className="um-id-row">
                    <input
                      type="text"
                      className="um-input"
                      placeholder="Enter series TMDB ID\u2026"
                      value={fixTmdbIdInput}
                      onChange={e => setFixTmdbIdInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFixTmdbIdSubmit()}
                    />
                    <button
                      className="um-id-submit"
                      onClick={handleFixTmdbIdSubmit}
                      disabled={fixing || !fixTmdbIdInput.trim()}
                    >
                      {fixing ? 'Matching\u2026' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right column: search + results */}
              <div className="fm-col-right">
                {/* TMDB Search */}
                <div className="um-search-section">
                  <label className="um-label">Search TMDB</label>
                  <div className="um-search-input-wrap">
                    <SearchIcon />
                    <input
                      type="text"
                      className="um-search-input"
                      placeholder="Search for a series\u2026"
                      value={fixSearchQuery}
                      onChange={e => setFixSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {fixSearching && <div className="um-search-spinner" />}
                  </div>
                </div>

                {/* Search Results */}
                <div className="um-results">
                  {fixSeriesResults.map(r => (
                    <button
                      className="um-result-card"
                      key={r.tmdbID}
                      onClick={() => handleFixResultClick(r.tmdbID)}
                      disabled={fixing}
                    >
                      <div className="um-result-poster">
                        {r.posterPath ? (
                          <img src={tmdbImg(r.posterPath, 'w300')} alt={r.name} onLoad={e => e.currentTarget.classList.add('loaded')} />
                        ) : (
                          <div className="um-no-poster">
                            <ImageIcon strokeWidth={1.5} />
                          </div>
                        )}
                      </div>
                      <div className="um-result-info">
                        <div className="um-result-title">{r.name}</div>
                        <div className="um-result-year">{r.firstAirYear ?? 'Unknown year'}</div>
                        <div className="um-result-id">TMDB: {r.tmdbID}</div>
                      </div>
                    </button>
                  ))}

                  {!fixSearching && fixSearchQuery.trim() && fixSeriesResults.length === 0 && (
                    <div className="um-no-results">
                      <SearchIcon strokeWidth={1.5} />
                      <p>No results found</p>
                      <span>Try a different search term or enter the TMDB ID directly</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
        </>)}
      </Modal>

      {/* Episode Media Info Modal */}
      <Modal open={!!mediaInfoEp} onClose={() => setMediaInfoEp(null)} className="media-info-modal">
        {mediaInfoEp && (
          <>
            <div className="media-info-modal-header">
              <h3>E{mediaInfoEp.episodeNumber} · {mediaInfoEp.name}</h3>
              <button className="media-info-modal-close" onClick={() => setMediaInfoEp(null)}>
                <CloseIcon />
              </button>
            </div>
            <MediaInfoPanel files={mediaInfoEp.files} />
          </>
        )}
      </Modal>
    </>
  );
}
