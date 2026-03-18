import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Hls from 'hls.js';
import './Player.css';

/* ─── Types ─── */
interface StreamInfo {
  codecName: string | null;
  codecMime: string | null;
  streamType: string | null;
  language: string | null;
  title: string | null;
  resolution: string | null;
  bitRate: number | null;
}

interface StreamingTicket {
  hlsStreamingPath: string;
  dashStreamingPath: string;
  jwt: string;
  metadataPath: string;
  streams: StreamInfo[];
}

interface LocationState {
  title?: string;
  subtitle?: string;
  mediaUuid?: string;
  startTime?: number;
}

/* ─── GraphQL helper ─── */
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

const CREATE_STREAMING_TICKET = `mutation CreateStreamingTicket($uuid: String!) {
  createStreamingTicket(uuid: $uuid) {
    error { message hasError }
    metadataPath
    hlsStreamingPath
    dashStreamingPath
    jwt
    streams {
      codecName
      codecMime
      streamType
      language
      title
      resolution
      bitRate
    }
  }
}`;

const CREATE_PLAY_STATE = `mutation CreatePlayState($uuid: String!, $finished: Boolean!, $playtime: Float!) {
  createPlayState(uuid: $uuid, finished: $finished, playtime: $playtime) {
    uuid
    playState { finished playtime }
  }
}`;

/* ─── Helpers ─── */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Probe which codecs the browser can play and return them as query string params. */
function getPlayableCodecsParams(): string {
  const candidates = [
    // H.264 profiles
    'avc1.4d4028', 'avc1.640028', 'avc1.64001e', 'avc1.640020',
    // AAC
    'mp4a.40.2', 'mp4a.40.5',
  ];

  const supported = candidates.filter(c => {
    try {
      return MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)
        || MediaSource.isTypeSupported(`audio/mp4; codecs="${c}"`);
    } catch {
      return false;
    }
  });

  if (supported.length === 0) return '';
  return supported.map(c => `playableCodecs=${encodeURIComponent(c)}`).join('&');
}

/* ─── Component ─── */
export default function Player() {
  const { fileUuid } = useParams<{ fileUuid: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) ?? {};

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>);
  const saveTimerRef = useRef<ReturnType<typeof setInterval>>(0 as unknown as ReturnType<typeof setInterval>);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<StreamingTicket | null>(null);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(75);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'quality' | 'speed' | 'subtitles'>('main');
  const [centerIcon, setCenterIcon] = useState<'play' | 'pause' | null>(null);

  // Quality & speed
  const [qualityLevels, setQualityLevels] = useState<Array<{ label: string; bitrate: number; index: number }>>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = auto
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Subtitle tracks
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ name: string; lang: string; index: number }>>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1); // -1 = off

  // Stream info for settings panel
  const audioStreams = ticket?.streams?.filter(s => s.streamType === 'audio') ?? [];

  /* ─── Fetch streaming ticket ─── */
  useEffect(() => {
    if (!fileUuid) return;
    setLoading(true);
    gqlFetch<{ createStreamingTicket: StreamingTicket & { error?: { hasError: boolean; message: string } } }>(
      CREATE_STREAMING_TICKET,
      { uuid: fileUuid },
    )
      .then(data => {
        const t = data.createStreamingTicket;
        if (t.error?.hasError) {
          setError(t.error.message);
        } else {
          setTicket(t);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [fileUuid]);

  /* ─── Initialize HLS ─── */
  useEffect(() => {
    if (!ticket || !videoRef.current) return;
    const video = videoRef.current;

    // Append playable codecs so the server transcodes unsupported formats
    const codecParams = getPlayableCodecsParams();
    const separator = ticket.hlsStreamingPath.includes('?') ? '&' : '?';
    const streamUrl = codecParams
      ? `${ticket.hlsStreamingPath}${separator}${codecParams}`
      : ticket.hlsStreamingPath;

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr, url) => {
          // Subtitle URLs already carry a JWT in the path — skip the header for those
          if (!url.includes('/s/files/jwt/')) {
            xhr.setRequestHeader('Authorization', `Bearer ${ticket.jwt}`);
          }
        },
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Extract available quality levels
        const levels = hls.levels.map((lvl, i) => {
          // Resolution may be in the manifest or encoded in the URL preset pattern
          let label = '';
          if (lvl.height > 0) {
            label = `${lvl.height}p`;
          } else {
            // Parse from URL: e.g. "0/preset:720-5000k-video/media.m3u8"
            const url = Array.isArray(lvl.url) ? lvl.url[0] : (lvl.url as string);
            const presetMatch = url?.match(/preset:(\d+)-/);
            if (presetMatch) {
              label = `${presetMatch[1]}p`;
            } else {
              label = 'Original';
            }
          }
          return { label, bitrate: lvl.bitrate, index: i };
        });
        // Deduplicate by label, keeping highest bitrate for each
        const byLabel = new Map<string, typeof levels[0]>();
        for (const l of levels) {
          const existing = byLabel.get(l.label);
          if (!existing || l.bitrate > existing.bitrate) byLabel.set(l.label, l);
        }
        setQualityLevels(Array.from(byLabel.values()).sort((a, b) => a.bitrate - b.bitrate));

        if (state.startTime && state.startTime > 0) {
          video.currentTime = state.startTime;
        }
        video.play().then(() => setPlaying(true)).catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError('Playback error occurred');
        }
      });
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        const subs = data.subtitleTracks.map((t, i) => ({
          name: t.name,
          lang: t.lang ?? '',
          index: i,
        }));
        setSubtitleTracks(subs);
        hls.subtitleTrack = -1;
      });
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        if (state.startTime && state.startTime > 0) {
          video.currentTime = state.startTime;
        }
        video.play().then(() => setPlaying(true)).catch(() => {});
      });
    } else {
      setError('HLS playback is not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  /* ─── Save play state periodically ─── */
  useEffect(() => {
    if (!state.mediaUuid) return;
    const mediaUuid = state.mediaUuid;

    saveTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || !isFinite(video.currentTime)) return;
      const finished = video.duration > 0 && (video.duration - video.currentTime) < 30;
      gqlFetch(CREATE_PLAY_STATE, {
        uuid: mediaUuid,
        finished,
        playtime: Math.floor(video.currentTime),
      }).catch(() => {});
    }, 10000);

    return () => clearInterval(saveTimerRef.current);
  }, [state.mediaUuid]);

  /* ─── Save state on unmount ─── */
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (!video || !state.mediaUuid || !isFinite(video.currentTime)) return;
      const finished = video.duration > 0 && (video.duration - video.currentTime) < 30;
      // Fire and forget
      gqlFetch(CREATE_PLAY_STATE, {
        uuid: state.mediaUuid,
        finished,
        playtime: Math.floor(video.currentTime),
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Video event handlers ─── */
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    // Update buffered
    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
  }, []);

  const onDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (video && isFinite(video.duration)) {
      setDuration(video.duration);
    }
  }, []);

  const onPlay = useCallback(() => setPlaying(true), []);
  const onPause = useCallback(() => setPlaying(false), []);
  const onEnded = useCallback(() => {
    setPlaying(false);
    // Save finished state
    if (state.mediaUuid) {
      gqlFetch(CREATE_PLAY_STATE, {
        uuid: state.mediaUuid,
        finished: true,
        playtime: Math.floor(videoRef.current?.duration ?? 0),
      }).catch(() => {});
    }
  }, [state.mediaUuid]);

  /* ─── Controls visibility ─── */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
        setShowSettings(false);
      }
    }, 3000);
  }, []);

  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimerRef.current);
  }, [showControls]);

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showControls();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 30);
          showControls();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => {
            const nv = Math.min(100, v + 5);
            video.volume = nv / 100;
            return nv;
          });
          showControls();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => {
            const nv = Math.max(0, v - 5);
            video.volume = nv / 100;
            return nv;
          });
          showControls();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            handleBack();
          }
          break;
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls]);

  /* ─── Actions ─── */
  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      flashCenter('play');
    } else {
      video.pause();
      flashCenter('pause');
    }
    showControls();
  }

  function flashCenter(icon: 'play' | 'pause') {
    setCenterIcon(icon);
    setTimeout(() => setCenterIcon(null), 600);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * duration;
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v / 100;
      videoRef.current.muted = v === 0;
      setMuted(v === 0);
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    showControls();
  }

  function skipBack() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 10);
    showControls();
  }

  function skipForward() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 30);
    showControls();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
    showControls();
  }

  function handleBack() {
    navigate(-1);
  }

  function switchQuality(levelIndex: number) {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex; // -1 = auto
    setSelectedQuality(levelIndex);
    setSettingsView('main');
  }

  function changeSpeed(speed: number) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setSettingsView('main');
  }

  function switchSubtitle(trackIndex: number) {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (!hls || !video) return;
    // subtitleDisplay must be set before subtitleTrack
    hls.subtitleDisplay = trackIndex !== -1;
    hls.subtitleTrack = trackIndex;
    // Sync native text track modes on the video element
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === trackIndex ? 'showing' : 'disabled';
    }
    setSelectedSubtitle(trackIndex);
    setSettingsView('main');
  }

  /* ─── Derived values ─── */
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const currentQualityLabel = selectedQuality === -1
    ? 'Auto'
    : qualityLevels.find(l => l.index === selectedQuality)?.label ?? '?';
  const audioLabel = audioStreams.length > 0
    ? [audioStreams[0].language?.toUpperCase(), audioStreams[0].title].filter(Boolean).join(' · ') || audioStreams[0].codecName?.toUpperCase()
    : null;
  const currentSubtitleLabel = selectedSubtitle === -1
    ? 'Off'
    : subtitleTracks.find(t => t.index === selectedSubtitle)?.name ?? '?';
  const speedOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  return (
    <div
      ref={containerRef}
      className={`player-viewport${controlsVisible ? ' controls-visible' : ''}`}
      onMouseMove={showControls}
      onClick={(e) => {
        // Only toggle play when clicking the video area, not controls
        if ((e.target as HTMLElement).closest('.top-overlay, .bottom-controls, .settings-panel')) return;
        togglePlay();
      }}
    >
      <video
        ref={videoRef}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />

      {/* Loading */}
      {loading && (
        <div className="player-loading">
          <div className="spinner" />
          <p>Preparing stream…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="player-error">
          <p>{error}</p>
          <button className="btn" onClick={handleBack}>Go Back</button>
        </div>
      )}

      {/* Center play/pause indicator */}
      <div className={`center-indicator${centerIcon ? ' visible' : ''}`}>
        {centerIcon === 'play' ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        )}
      </div>

      {/* Top overlay */}
      <div className="top-overlay">
        <button className="top-btn" title="Back" onClick={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="now-playing">
          <h2>{state.title ?? 'Now Playing'}</h2>
          {state.subtitle && <p>{state.subtitle}</p>}
        </div>
        <div className="top-actions">
          <button className="top-btn" title="Picture in Picture" onClick={() => {
            videoRef.current?.requestPictureInPicture?.().catch(() => {});
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2" /><rect x="11" y="11" width="9" height="8" rx="1" /></svg>
          </button>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="bottom-controls">
        {/* Progress */}
        <div className="progress-container" onClick={handleSeek}>
          <div className="progress-track">
            <div className="progress-buffer" style={{ width: `${bufferPct}%` }} />
            <div className="progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="progress-thumb" style={{ left: `${progressPct}%` }} />
        </div>

        {/* Controls row */}
        <div className="controls-row">
          <button className="ctrl-btn" title="Rewind 10s" onClick={skipBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">10</text>
            </svg>
          </button>

          <button className="ctrl-btn play-pause" title={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
          </button>

          <button className="ctrl-btn" title="Forward 30s" onClick={skipForward}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">30</text>
            </svg>
          </button>

          <span className="time-display">
            <span className="current">{formatTime(currentTime)}</span> / {formatTime(duration)}
          </span>

          <span className="spacer" />

          {/* Subtitles toggle */}
          {subtitleTracks.length > 0 && (
            <button
              className={`ctrl-btn${selectedSubtitle !== -1 ? ' sub-active' : ''}`}
              title="Subtitles"
              onClick={() => {
                if (selectedSubtitle === -1) {
                  switchSubtitle(0);
                } else {
                  switchSubtitle(-1);
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="16" x2="14" y2="16" /></svg>
            </button>
          )}

          {/* Volume */}
          <div className="volume-group">
            <button className="ctrl-btn" title="Volume" onClick={toggleMute}>
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
              )}
            </button>
            <div className="volume-slider">
              <input type="range" min="0" max="100" value={muted ? 0 : volume} onChange={handleVolumeChange} />
            </div>
          </div>

          {/* Settings */}
          <button className="ctrl-btn" title="Settings" onClick={() => { setShowSettings(s => !s); setSettingsView('main'); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>

          {/* Fullscreen */}
          <button className="ctrl-btn" title="Fullscreen" onClick={toggleFullscreen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="settings-panel">
          {settingsView === 'main' && (
            <>
              <div className="sp-item" onClick={() => setSettingsView('quality')}>
                <span className="sp-label">Quality</span>
                <span className="sp-value">{currentQualityLabel} <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></span>
              </div>
              {audioLabel && (
                <div className="sp-item">
                  <span className="sp-label">Audio Track</span>
                  <span className="sp-value">{audioLabel}</span>
                </div>
              )}
              {subtitleTracks.length > 0 && (
                <div className="sp-item" onClick={() => setSettingsView('subtitles')}>
                  <span className="sp-label">Subtitles</span>
                  <span className="sp-value">{currentSubtitleLabel} <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></span>
                </div>
              )}
              <div className="sp-divider" />
              <div className="sp-item" onClick={() => setSettingsView('speed')}>
                <span className="sp-label">Playback Speed</span>
                <span className="sp-value">{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`} <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></span>
              </div>
            </>
          )}

          {settingsView === 'quality' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                <span>Quality</span>
              </div>
              <div className="sp-divider" />
              <div className={`sp-option${selectedQuality === -1 ? ' active' : ''}`} onClick={() => switchQuality(-1)}>
                <span>Auto</span>
                {selectedQuality === -1 && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              {qualityLevels.map(level => (
                <div key={level.index} className={`sp-option${selectedQuality === level.index ? ' active' : ''}`} onClick={() => switchQuality(level.index)}>
                  <span>{level.label}</span>
                  <span className="sp-bitrate">{(level.bitrate / 1_000_000).toFixed(1)} Mbps</span>
                  {selectedQuality === level.index && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
              ))}
            </>
          )}

          {settingsView === 'subtitles' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                <span>Subtitles</span>
              </div>
              <div className="sp-divider" />
              <div className={`sp-option${selectedSubtitle === -1 ? ' active' : ''}`} onClick={() => switchSubtitle(-1)}>
                <span>Off</span>
                {selectedSubtitle === -1 && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              {subtitleTracks.map(track => (
                <div key={track.index} className={`sp-option${selectedSubtitle === track.index ? ' active' : ''}`} onClick={() => switchSubtitle(track.index)}>
                  <span>{track.name}</span>
                  {track.lang && <span className="sp-lang">{track.lang.toUpperCase()}</span>}
                  {selectedSubtitle === track.index && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
              ))}
            </>
          )}

          {settingsView === 'speed' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                <span>Playback Speed</span>
              </div>
              <div className="sp-divider" />
              {speedOptions.map(s => (
                <div key={s} className={`sp-option${playbackSpeed === s ? ' active' : ''}`} onClick={() => changeSpeed(s)}>
                  <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                  {playbackSpeed === s && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
