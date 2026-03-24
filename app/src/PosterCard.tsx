import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJwt, handleAuthFailure } from './auth';
import './PosterCard.css';
import Modal from './Modal';
import { PlayIcon, CheckIcon } from './Icons';

/* ─── Types ─── */
interface StreamInfo {
  codecName: string | null;
  bitRate: number | null;
  streamType: string | null;
  resolution: string | null;
}

interface PlayState {
  finished: boolean;
  playtime: number;
}

interface FileInfo {
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: StreamInfo[];
}

interface FilePickerOption {
  uuid: string;
  resolution: string;
  codec: string;
  bitrate: string;
  size: string;
}

interface FilePickerState {
  title: string;
  subtitle: string;
  mediaUuid: string;
  startTime: number;
  episodeUuid?: string;
  options: FilePickerOption[];
}

export interface PosterCardProps {
  /** URL for the poster image */
  posterUrl: string;
  /** Display title below the poster */
  title: string;
  /** Secondary text below the title */
  subtitle?: string;
  /** Badge text (e.g. "New", "3 new") */
  badge?: string;
  /** Navigation path when clicking the card body */
  detailPath: string;
  /** Media type for play behavior: 'movie' plays directly, 'series' fetches first episode */
  mediaType: 'movie' | 'series';
  /** For movies: files to play. For series: not needed (fetched on demand) */
  files?: FileInfo[];
  /** Play state for resume position */
  playState?: PlayState | null;
  /** Media uuid for the playback route */
  mediaUuid: string;
  /** Series uuid (only for mediaType='series') */
  seriesUuid?: string;
  /** Whether the item has been fully watched */
  watched?: boolean;
  /** Progress fraction (0–1) for partially-watched items */
  progress?: number;
  /** Optional callback fired before navigation (e.g. to clear search) */
  onNavigate?: () => void;
}

/* ─── Helpers ─── */
function formatFileSize(bytesStr: string): string {
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes === 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function buildFileOptions(files: FileInfo[]): FilePickerOption[] {
  return [...files]
    .sort((a, b) => {
      const resA = parseInt(a.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
      const resB = parseInt(b.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
      return resB - resA;
    })
    .map(f => {
      const vs = f.streams?.find(s => s.streamType === 'video');
      return {
        uuid: f.uuid,
        resolution: vs?.resolution ?? 'Unknown',
        codec: vs?.codecName?.toUpperCase() ?? '',
        bitrate: vs?.bitRate ? `${Math.round(vs.bitRate / 1000)}k` : '',
        size: formatFileSize(f.fileSize),
      };
    });
}

const MOVIE_FILES_QUERY = `query MovieFiles($uuid: String!) {
  movies(uuid: $uuid) {
    title
    year
    playState { finished playtime }
    files {
      uuid
      totalDuration
      fileSize
      streams { codecName bitRate streamType resolution }
    }
  }
}`;

const SERIES_FIRST_EPISODE_QUERY = `query SeriesFirstEp($uuid: String!) {
  series(uuid: $uuid) {
    name
    seasons {
      seasonNumber
      name
      episodes {
        name
        episodeNumber
        uuid
        playState { finished playtime }
        files {
          uuid
          totalDuration
          fileSize
          streams { codecName bitRate streamType resolution }
        }
      }
    }
  }
}`;

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
export default function PosterCard({
  posterUrl,
  title,
  subtitle,
  badge,
  detailPath,
  mediaType,
  files,
  playState,
  mediaUuid,
  seriesUuid,
  watched,
  progress,
  onNavigate,
}: PosterCardProps) {
  const navigate = useNavigate();
  const [filePicker, setFilePicker] = useState<FilePickerState | null>(null);

  function playFile(fileUuid: string, playTitle: string, playSub: string, playMediaUuid: string, startTime: number, episodeUuid?: string) {
    navigate(`/play/${fileUuid}`, {
      state: { title: playTitle, subtitle: playSub, mediaUuid: playMediaUuid, startTime, episodeUuid },
    });
  }

  async function handleMoviePlay() {
    let movieFiles = files;
    let moviePlayState = playState;
    let movieTitle = title;
    let movieSub = subtitle ?? '';

    if (!movieFiles || movieFiles.length === 0) {
      try {
        const data = await gqlFetch<{
          movies: Array<{
            title: string;
            year: string;
            playState: PlayState | null;
            files: FileInfo[];
          }>;
        }>(MOVIE_FILES_QUERY, { uuid: mediaUuid });
        const movie = data.movies?.[0];
        if (!movie || !movie.files?.length) return;
        movieFiles = movie.files;
        moviePlayState = movie.playState;
        movieTitle = movie.title;
        movieSub = movie.year ?? movieSub;
      } catch {
        return;
      }
    }

    const startTime = moviePlayState?.finished ? 0 : (moviePlayState?.playtime ?? 0);

    if (movieFiles.length === 1) {
      playFile(movieFiles[0].uuid, movieTitle, movieSub, mediaUuid, startTime);
    } else {
      setFilePicker({
        title: movieTitle,
        subtitle: movieSub,
        mediaUuid,
        startTime,
        options: buildFileOptions(movieFiles),
      });
    }
  }

  async function handleSeriesPlay() {
    const uuid = seriesUuid ?? mediaUuid;
    try {
      const data = await gqlFetch<{
        series: Array<{
          name: string;
          seasons: Array<{
            seasonNumber: number;
            name: string;
            episodes: Array<{
              name: string;
              episodeNumber: number;
              uuid: string;
              playState: PlayState | null;
              files: FileInfo[];
            }>;
          }>;
        }>;
      }>(SERIES_FIRST_EPISODE_QUERY, { uuid });

      const seriesData = data.series[0];
      if (!seriesData) return;

      const sortedSeasons = [...seriesData.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
      let targetEp: typeof sortedSeasons[0]['episodes'][0] | null = null;
      let targetSeason: typeof sortedSeasons[0] | null = null;

      for (const season of sortedSeasons) {
        const sortedEps = [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
        const ep = sortedEps.find(e => e.files.length > 0);
        if (ep) {
          targetEp = ep;
          targetSeason = season;
          break;
        }
      }

      if (!targetEp || !targetSeason) return;

      const startTime = targetEp.playState?.finished ? 0 : (targetEp.playState?.playtime ?? 0);
      const sub = `${seriesData.name} · ${targetSeason.name} · E${targetEp.episodeNumber}`;

      if (targetEp.files.length === 1) {
        playFile(targetEp.files[0].uuid, targetEp.name, sub, targetEp.uuid, startTime, targetEp.uuid);
      } else {
        setFilePicker({
          title: targetEp.name,
          subtitle: sub,
          mediaUuid: targetEp.uuid,
          startTime,
          episodeUuid: targetEp.uuid,
          options: buildFileOptions(targetEp.files),
        });
      }
    } catch {
      // silently fail
    }
  }

  function handlePlayClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (mediaType === 'movie') {
      void handleMoviePlay();
    } else {
      void handleSeriesPlay();
    }
  }

  return (
    <>
      <div
        className="poster-card"
        onClick={() => { onNavigate?.(); navigate(detailPath); }}
        style={{ cursor: 'pointer' }}
      >
        <div className="poster">
          {posterUrl && (
            <img
              src={posterUrl}
              alt={title}
              loading="lazy"
              onLoad={e => e.currentTarget.classList.add('loaded')}
            />
          )}
          {badge && <span className="badge-new">{badge}</span>}
          {watched && (
            <span className="watched-badge">
              <CheckIcon width={12} height={12} />
            </span>
          )}
          {!watched && progress != null && progress > 0 && (
            <div className="poster-progress-bar">
              <div className="poster-progress-fill" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
            </div>
          )}
          <div className="play-overlay" onClick={handlePlayClick}>
            <PlayIcon />
          </div>
        </div>
        <div className="p-title">{title}</div>
        {subtitle && <div className="p-year">{subtitle}</div>}
      </div>

      <Modal open={!!filePicker} onClose={() => setFilePicker(null)} className="fp-modal">
        {filePicker && (<>
          <div className="fp-header">
            <span className="fp-label">Choose Version</span>
            <span className="fp-title">{filePicker.subtitle}</span>
          </div>
          {filePicker.options.map(opt => (
            <button
              key={opt.uuid}
              className="fp-option"
              onClick={() => {
                playFile(opt.uuid, filePicker.title, filePicker.subtitle, filePicker.mediaUuid, filePicker.startTime, filePicker.episodeUuid);
                setFilePicker(null);
              }}
            >
              <PlayIcon className="fp-play-icon" />
              <span className="fp-res">{opt.resolution}</span>
              <span className="fp-tags">
                {opt.codec && <span className="fp-tag">{opt.codec}</span>}
                {opt.bitrate && <span className="fp-tag">{opt.bitrate}</span>}
              </span>
              <span className="fp-size">{opt.size}</span>
            </button>
          ))}
        </>)}
      </Modal>
    </>
  );
}
