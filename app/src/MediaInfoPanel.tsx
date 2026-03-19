import { useState } from 'react';
import './MediaInfoPanel.css';
import {
  MonitorIcon, VolumeIcon, SubtitlesIcon,
  FilmStripIcon, HardDriveIcon, FileIcon,
} from './Icons';

/* ─── Types ─── */
export interface MediaStream {
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

export interface MediaFile {
  fileName: string;
  filePath: string;
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: MediaStream[];
}

interface MediaInfoPanelProps {
  files: MediaFile[];
  className?: string;
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

/* ─── Component ─── */
export default function MediaInfoPanel({ files, className }: MediaInfoPanelProps) {
  const hasMultipleFiles = files.length > 1;
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  const sortedFiles = [...files].sort((a, b) => {
    const resA = parseInt(a.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
    const resB = parseInt(b.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
    return resB - resA;
  });

  const file = sortedFiles[activeFileIdx] ?? sortedFiles[0];
  if (!file) return null;

  const videoStream = file.streams?.find(s => s.streamType === 'video');
  const audioStreams = file.streams?.filter(s => s.streamType === 'audio') ?? [];
  const subtitleStreams = file.streams?.filter(s => s.streamType === 'subtitle') ?? [];
  const resolutionLabel = videoStream?.resolution ?? null;
  const videoCodec = videoStream?.codecName?.toUpperCase() ?? null;

  return (
    <div className={`media-info-panel${className ? ` ${className}` : ''}`}>
      <div className="media-info-header">
        <FilmStripIcon />
        <span>Media Info</span>
        {hasMultipleFiles && (
          <div className="media-info-file-tabs">
            {sortedFiles.map((f, i) => {
              const vs = f.streams?.find(s => s.streamType === 'video');
              const res = vs?.resolution ?? 'File ' + (i + 1);
              return (
                <button
                  key={f.uuid}
                  className={`media-info-file-tab${i === activeFileIdx ? ' active' : ''}`}
                  onClick={() => setActiveFileIdx(i)}
                >
                  {res}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="media-info-stats">
        {resolutionLabel && (
          <div className="media-stat">
            <MonitorIcon className="media-stat-icon" />
            <div className="media-stat-content">
              <span className="media-stat-label">Resolution</span>
              <span className="media-stat-value">{resolutionLabel}</span>
            </div>
          </div>
        )}
        {videoCodec && (
          <div className="media-stat">
            <FilmStripIcon className="media-stat-icon" />
            <div className="media-stat-content">
              <span className="media-stat-label">Video Codec</span>
              <span className="media-stat-value">{videoCodec}{videoStream?.profile ? ` (${videoStream.profile})` : ''}</span>
            </div>
          </div>
        )}
        <div className="media-stat">
          <HardDriveIcon className="media-stat-icon" />
          <div className="media-stat-content">
            <span className="media-stat-label">File Size</span>
            <span className="media-stat-value">{formatFileSize(file.fileSize)}</span>
          </div>
        </div>
      </div>

      {audioStreams.length > 0 && (
        <div className="media-info-row">
          <VolumeIcon className="media-row-icon" />
          <div className="media-row-content">
            <span className="media-row-label">Audio</span>
            <div className="media-chips">
              {audioStreams.map((a, i) => {
                const parts: string[] = [];
                if (a.language) parts.push(a.language.toUpperCase());
                if (a.codecName) parts.push(a.codecName);
                if (a.title) parts.push(a.title);
                return (
                  <span key={i} className="media-chip">
                    {parts.join(' · ') || 'Unknown'}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {subtitleStreams.length > 0 && (
        <div className="media-info-row">
          <SubtitlesIcon className="media-row-icon" />
          <div className="media-row-content">
            <span className="media-row-label">Subtitles</span>
            <div className="media-chips">
              {subtitleStreams.map((s, i) => (
                <span key={i} className="media-chip media-chip-sm">
                  {s.language?.toUpperCase() || s.title || 'Unknown'}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="media-info-footer">
        <FileIcon className="media-footer-icon" />
        <span className="media-footer-name">{file.fileName}</span>
      </div>
    </div>
  );
}
