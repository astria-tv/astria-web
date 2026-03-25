import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJwt, parseJwt, handleAuthFailure } from './auth';
import './DetailPage.css';
import './MovieDetails.css';
import Modal from './Modal';
import {
  CheckIcon, MoreVerticalIcon, SearchIcon, PlayIcon,
  ChevronDownIcon, InfoIcon, CloseIcon,
  ErrorCircleIcon, ImageIcon,
  BookmarkIcon, BookmarkFilledIcon,
} from './Icons';
import MediaInfoPanel from './MediaInfoPanel';

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

interface MovieFile {
  fileName: string;
  filePath: string;
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: Stream[];
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

interface Movie {
  title: string;
  original_title: string;
  year: string;
  overview: string;
  imdbID: string;
  tmdbID: number;
  backdropPath: string;
  posterPath: string;
  posterURL: string;
  uuid: string;
  files: MovieFile[];
  playState: PlayState | null;
  onWatchlist: boolean;
  cast: CastRole[];
}

interface TmdbMovieResult {
  title: string;
  releaseYear: number | null;
  overview: string;
  tmdbID: number;
  backdropPath: string;
  posterPath: string;
}

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

const TMDB_SEARCH_MOVIES = `query ($query: String!) {
  tmdbSearchMovies(query: $query) {
    title releaseYear overview tmdbID backdropPath posterPath
  }
}`;

const UPDATE_MOVIE_FILE = `mutation ($input: UpdateMovieFileMetadataInput!) {
  updateMovieFileMetadata(input: $input) {
    error { message hasError }
    mediaItem {
      ... on Movie { uuid }
    }
  }
}`;

/* ─── Query ─── */
const MOVIE_DETAIL_QUERY = `query MovieDetail($uuid: String!) {
  movies(uuid: $uuid) {
    title
    original_title
    year
    overview
    imdbID
    tmdbID
    backdropPath
    posterURL(width: 500)
    uuid
    onWatchlist
    playState { finished playtime }
    cast {
      character
      person { name profilePath tmdbID }
    }
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

function formatFileSize(bytesStr: string): string {
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes === 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function progressPercent(movie: Movie): number {
  if (!movie.playState || movie.playState.finished) return 0;
  const duration = movie.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.round((movie.playState.playtime / duration) * 100));
}

async function gqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const jwt = getJwt();
  const res = await fetch('/olaris/m/query', {
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
export default function MovieDetails() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [togglingWatchlist, setTogglingWatchlist] = useState(false);

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
  const [fixSearchQuery, setFixSearchQuery] = useState('');
  const [fixTmdbIdInput, setFixTmdbIdInput] = useState('');
  const [fixMovieResults, setFixMovieResults] = useState<TmdbMovieResult[]>([]);
  const [fixSearching, setFixSearching] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState('');
  const [fixSuccess, setFixSuccess] = useState('');

  useEffect(() => {
    if (!uuid) return;
    setLoading(true);
    gqlFetch<{ movies: Movie[] }>(MOVIE_DETAIL_QUERY, { uuid })
      .then(data => {
        if (data.movies.length > 0) {
          setMovie(data.movies[0]);
        } else {
          setError('Movie not found');
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

  // TMDB search with debounce for fix match
  useEffect(() => {
    if (!fixSearchQuery.trim() || !showFixMatch) {
      setFixMovieResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setFixSearching(true);
      try {
        const data = await gqlFetch<{ tmdbSearchMovies: TmdbMovieResult[] }>(
          TMDB_SEARCH_MOVIES,
          { query: fixSearchQuery.trim() },
        );
        setFixMovieResults(data.tmdbSearchMovies ?? []);
      } catch {
        setFixMovieResults([]);
      } finally {
        setFixSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [fixSearchQuery, showFixMatch]);

  function openFixMatch() {
    setDropdownOpen(false);
    setShowFixMatch(true);
    setFixSearchQuery(movie?.title ?? '');
    setFixTmdbIdInput('');
    setFixMovieResults([]);
    setFixError('');
    setFixSuccess('');
  }

  function closeFixMatch() {
    setShowFixMatch(false);
    setFixSearchQuery('');
    setFixTmdbIdInput('');
    setFixMovieResults([]);
    setFixError('');
    setFixSuccess('');
  }

  async function doFixMatch(tmdbID: number) {
    if (!movie || !file) return;
    setFixing(true);
    setFixError('');
    setFixSuccess('');
    try {
      const data = await gqlFetch<{
        updateMovieFileMetadata: {
          error: { message: string; hasError: boolean } | null;
          mediaItem: { uuid: string } | null;
        };
      }>(UPDATE_MOVIE_FILE, {
        input: { movieFileUUID: file.uuid, tmdbID },
      });
      if (data.updateMovieFileMetadata.error?.hasError) {
        setFixError(data.updateMovieFileMetadata.error.message);
        return;
      }
      setFixSuccess('Match updated successfully!');
      const newUuid = data.updateMovieFileMetadata.mediaItem?.uuid;
      setTimeout(() => {
        closeFixMatch();
        if (newUuid && newUuid !== movie.uuid) {
          navigate(`/movie/${newUuid}`, { replace: true });
        } else {
          window.location.reload();
        }
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
    doFixMatch(id);
  }

  async function toggleWatchlist() {
    if (!movie || togglingWatchlist) return;
    setTogglingWatchlist(true);
    try {
      if (movie.onWatchlist) {
        await gqlFetch(REMOVE_FROM_WATCHLIST, { mediaUUID: movie.uuid });
      } else {
        await gqlFetch(ADD_TO_WATCHLIST, { mediaUUID: movie.uuid, mediaType: 'movie' });
      }
      setMovie(prev => prev ? { ...prev, onWatchlist: !prev.onWatchlist } : prev);
    } catch (err) {
      console.error('Failed to toggle watchlist:', err);
    } finally {
      setTogglingWatchlist(false);
    }
  }

  async function toggleWatched() {
    if (!movie || toggling) return;
    const isWatched = movie.playState?.finished ?? false;
    setToggling(true);
    try {
      await gqlFetch(CREATE_PLAY_STATE, {
        uuid: movie.uuid,
        finished: !isWatched,
        playtime: !isWatched ? 0 : 0,
      });
      setMovie(prev => prev ? {
        ...prev,
        playState: { finished: !isWatched, playtime: 0 },
      } : prev);
    } catch (err) {
      console.error('Failed to toggle watched state:', err);
    } finally {
      setToggling(false);
    }
  }

  // File version selection state (must be before early returns per Rules of Hooks)
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const versionPickerRef = useRef<HTMLDivElement>(null);

  // Close version picker on outside click
  useEffect(() => {
    if (!showVersionPicker) return;
    function handleClick(e: MouseEvent) {
      if (versionPickerRef.current && !versionPickerRef.current.contains(e.target as Node)) {
        setShowVersionPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showVersionPicker]);

  if (loading) {
    return (
      <div className="loading-state"><div className="spinner" /></div>
    );
  }

  if (error || !movie) {
    return (
      <div className="error-state">
          <p>{error ?? 'Movie not found'}</p>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
    );
  }

  const hasMultipleFiles = movie.files.length > 1;

  // Sort files by resolution (highest first) for display
  const sortedFiles = [...movie.files].sort((a, b) => {
    const resA = a.streams?.find(s => s.streamType === 'video')?.resolution ?? '';
    const resB = b.streams?.find(s => s.streamType === 'video')?.resolution ?? '';
    const numA = parseInt(resA) || 0;
    const numB = parseInt(resB) || 0;
    return numB - numA; // highest first
  });

  const file = sortedFiles[selectedFileIdx] ?? sortedFiles[0];
  const duration = file?.totalDuration;
  const progress = progressPercent(movie);

  // Extract stream info
  const videoStream = file?.streams?.find(s => s.streamType === 'video');

  const resolutionLabel = videoStream?.resolution ?? null;
  const videoCodec = videoStream?.codecName?.toUpperCase() ?? null;

  return (
    <>
      {/* Backdrop */}
      <section className="backdrop">
        <div className="backdrop-img">
          {movie.backdropPath && (
            <img src={tmdbImg(movie.backdropPath, 'original')} alt="" onLoad={e => e.currentTarget.classList.add('loaded')} />
          )}
        </div>
      </section>

      {/* Detail Content */}
      <div className="detail-content">
        <div className="detail-poster">
          {movie.posterURL && <img src={movie.posterURL} alt={movie.title} onLoad={e => e.currentTarget.classList.add('loaded')} />}
          {resolutionLabel && <span className="badge-4k">{resolutionLabel}</span>}
        </div>

        <div className="detail-info">
          <h1>{movie.title}</h1>
          {movie.original_title && movie.original_title !== movie.title && (
            <p className="original-title">{movie.original_title}</p>
          )}

          <div className="meta-row">
            <span>{movie.year}</span>
            {duration && (
              <>
                <span>•</span>
                <span>{formatDuration(duration)}</span>
              </>
            )}
            {videoCodec && (
              <>
                <span>•</span>
                <span className="rating-box">{videoCodec}</span>
              </>
            )}
            {progress > 0 && (
              <>
                <span>•</span>
                <span className="meta-progress-label">
                  {formatDuration((duration ?? 0) - (movie.playState?.playtime ?? 0))} remaining
                </span>
              </>
            )}
            <button
              className={`btn-movie-toggle${movie.playState?.finished ? ' active' : ''}`}
              onClick={toggleWatched}
              disabled={toggling}
              title={movie.playState?.finished ? 'Mark as unwatched' : 'Mark as watched'}
            >
              <CheckIcon />
              {toggling ? 'Updating…' : movie.playState?.finished ? 'Watched' : 'Mark Watched'}
            </button>
            <button
              className={`btn-movie-toggle${movie.onWatchlist ? ' active' : ''}`}
              onClick={toggleWatchlist}
              disabled={togglingWatchlist}
              title={movie.onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              {movie.onWatchlist ? <BookmarkFilledIcon /> : <BookmarkIcon />}
            </button>
            {isAdmin && (
              <div className="admin-dropdown" ref={dropdownRef}>
                <button
                  className="btn-movie-toggle admin-dropdown-toggle-inline"
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
            )}
          </div>

          {/* Progress bar if in-progress */}
          {progress > 0 && (
            <div className="detail-progress">
              <div className="detail-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="detail-actions">
            <div className="play-btn-group" ref={versionPickerRef}>
              <button className="btn btn-play" onClick={() => {
                if (file) {
                  navigate(`/play/${file.uuid}`, {
                    state: {
                      title: movie.title,
                      subtitle: [movie.year, duration ? formatDuration(duration) : null, resolutionLabel].filter(Boolean).join(' · '),
                      mediaUuid: movie.uuid,
                      startTime: movie.playState?.finished ? 0 : (movie.playState?.playtime ?? 0),
                    },
                  });
                }
              }}>
                <PlayIcon />
                {progress > 0 ? 'Resume' : 'Play'}
                {hasMultipleFiles && resolutionLabel && (
                  <span className="play-btn-res">{resolutionLabel}</span>
                )}
              </button>
              {hasMultipleFiles && (
                <button
                  className={`btn btn-play btn-play-dropdown${showVersionPicker ? ' active' : ''}`}
                  onClick={() => setShowVersionPicker(v => !v)}
                  title="Choose version"
                >
                  <ChevronDownIcon width={14} height={14} />
                </button>
              )}
              {showVersionPicker && (
                <div className="version-picker">
                  <div className="version-picker-header">Choose Version</div>
                  {sortedFiles.map((f, i) => {
                    const vs = f.streams?.find(s => s.streamType === 'video');
                    const res = vs?.resolution ?? 'Unknown';
                    const codec = vs?.codecName?.toUpperCase() ?? '';
                    const bitrate = vs?.bitRate ? `${Math.round(vs.bitRate / 1000)}k` : '';
                    const size = formatFileSize(f.fileSize);
                    const isSelected = i === selectedFileIdx;
                    return (
                      <button
                        key={f.uuid}
                        className={`version-option${isSelected ? ' selected' : ''}`}
                        onClick={() => {
                          setSelectedFileIdx(i);
                          setShowVersionPicker(false);
                        }}
                      >
                        <div className="version-option-main">
                          <span className="version-res">{res}</span>
                          <span className="version-tags">
                            {codec && <span className="version-tag">{codec}</span>}
                            {bitrate && <span className="version-tag">{bitrate}</span>}
                          </span>
                        </div>
                        <span className="version-size">{size}</span>
                        {isSelected && (
                          <CheckIcon className="version-check" />
                        )}
                      </button>
                    );
                  })}
                  <div className="version-picker-hint">
                    <InfoIcon />
                    {sortedFiles.length} versions available
                  </div>
                </div>
              )}
            </div>
            {movie.imdbID && (
              <a
                className="btn btn-ghost"
                href={`https://www.imdb.com/title/${encodeURIComponent(movie.imdbID)}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                IMDb
              </a>
            )}
          </div>

          <div className="synopsis">
            <h3>Synopsis</h3>
            <p>{movie.overview || 'No synopsis available.'}</p>
          </div>

          {movie.cast.length > 0 && (
            <div className="cast-section">
              <h3>Cast</h3>
              <div className="cast-scroll">
                {movie.cast.map(role => (
                  <div className="cast-card" key={`${role.person.tmdbID}-${role.character}`}>
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

          <MediaInfoPanel files={sortedFiles} />
        </div>
      </div>

      {/* Fix Match Modal */}
      <Modal open={showFixMatch} onClose={closeFixMatch} className="um-panel">
            <div className="um-panel-header">
              <div>
                <h2>Fix Match</h2>
                <p className="um-panel-filename">{movie.title} ({movie.year})</p>
              </div>
              <button className="um-panel-close" onClick={closeFixMatch}>
                <CloseIcon />
              </button>
            </div>

            {fixError && (
              <div className="admin-error" style={{ margin: '0 24px 16px' }}>
                <ErrorCircleIcon />
                {fixError}
              </div>
            )}

            {fixSuccess && (
              <div className="um-success" style={{ margin: '0 24px 16px' }}>
                <CheckIcon />
                {fixSuccess}
              </div>
            )}

            {/* TMDB ID Input */}
            <div className="um-id-section">
              <label className="um-label">TMDB ID</label>
              <div className="um-id-row">
                <input
                  type="text"
                  className="um-input"
                  placeholder="Enter movie TMDB ID\u2026"
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

            {/* TMDB Search */}
            <div className="um-search-section">
              <label className="um-label">Search TMDB</label>
              <div className="um-search-input-wrap">
                <SearchIcon />
                <input
                  type="text"
                  className="um-search-input"
                  placeholder="Search for a movie\u2026"
                  value={fixSearchQuery}
                  onChange={e => setFixSearchQuery(e.target.value)}
                  autoFocus
                />
                {fixSearching && <div className="um-search-spinner" />}
              </div>
            </div>

            {/* Search Results */}
            <div className="um-results">
              {fixMovieResults.map(r => (
                <button
                  className="um-result-card"
                  key={r.tmdbID}
                  onClick={() => doFixMatch(r.tmdbID)}
                  disabled={fixing}
                >
                  <div className="um-result-poster">
                    {r.posterPath ? (
                      <img src={tmdbImg(r.posterPath, 'w300')} alt={r.title} onLoad={e => e.currentTarget.classList.add('loaded')} />
                    ) : (
                      <div className="um-no-poster">
                        <ImageIcon strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="um-result-info">
                    <div className="um-result-title">{r.title}</div>
                    <div className="um-result-year">{r.releaseYear ?? 'Unknown year'}</div>
                    <div className="um-result-id">TMDB: {r.tmdbID}</div>
                    {r.overview && <div className="um-result-overview">{r.overview}</div>}
                  </div>
                </button>
              ))}

              {!fixSearching && fixSearchQuery.trim() && fixMovieResults.length === 0 && (
                <div className="um-no-results">
                  <SearchIcon strokeWidth={1.5} />
                  <p>No results found</p>
                  <span>Try a different search term or enter the TMDB ID directly</span>
                </div>
              )}
            </div>
      </Modal>
    </>
  );
}
