import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './MovieDetails.css';

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
}

/* ─── Mutations ─── */
const CREATE_PLAY_STATE = `mutation CreatePlayState($uuid: String!, $finished: Boolean!, $playtime: Float!) {
  createPlayState(uuid: $uuid, finished: $finished, playtime: $playtime) {
    uuid
    playState { finished playtime }
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
export default function MovieDetails() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

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

  const file = movie.files?.[0];
  const duration = file?.totalDuration;
  const progress = progressPercent(movie);

  // Extract stream info
  const videoStream = file?.streams?.find(s => s.streamType === 'video');
  const audioStreams = file?.streams?.filter(s => s.streamType === 'audio') ?? [];
  const subtitleStreams = file?.streams?.filter(s => s.streamType === 'subtitle') ?? [];

  const resolutionLabel = videoStream?.resolution ?? null;
  const videoCodec = videoStream?.codecName?.toUpperCase() ?? null;
  const audioSummary = audioStreams.length > 0
    ? audioStreams.map(a => {
        const parts: string[] = [];
        if (a.language) parts.push(a.language.toUpperCase());
        if (a.codecName) parts.push(a.codecName.toUpperCase());
        if (a.title) parts.push(a.title);
        return parts.join(' · ') || a.codecName || 'Unknown';
      }).join(', ')
    : null;
  const subtitleSummary = subtitleStreams.length > 0
    ? subtitleStreams.map(s => s.language?.toUpperCase() || s.title || 'Unknown').join(', ')
    : null;

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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              {toggling ? 'Updating…' : movie.playState?.finished ? 'Watched' : 'Mark Watched'}
            </button>
          </div>

          {/* Progress bar if in-progress */}
          {progress > 0 && (
            <div className="detail-progress">
              <div className="detail-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="detail-actions">
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
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {progress > 0 ? 'Resume' : 'Play'}
            </button>
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

          <div className="info-grid">
            {resolutionLabel && (
              <div className="info-item">
                <label>Resolution</label>
                <span>{resolutionLabel}</span>
              </div>
            )}
            {videoCodec && (
              <div className="info-item">
                <label>Video Codec</label>
                <span>{videoCodec}{videoStream?.profile ? ` (${videoStream.profile})` : ''}</span>
              </div>
            )}
            {audioSummary && (
              <div className="info-item">
                <label>Audio</label>
                <span>{audioSummary}</span>
              </div>
            )}
            {subtitleSummary && (
              <div className="info-item">
                <label>Subtitles</label>
                <span>{subtitleSummary}</span>
              </div>
            )}
            {file && (
              <div className="info-item">
                <label>File Size</label>
                <span>{formatFileSize(file.fileSize)}</span>
              </div>
            )}
            {file?.fileName && (
              <div className="info-item">
                <label>File Name</label>
                <span>{file.fileName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
