import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Hls from 'hls.js';
import { getJwt, handleAuthFailure } from './auth';
import './Player.css';
import {
  PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon,
  PipIcon, SkipBackIcon, SkipForwardIcon, SubtitlesIcon,
  VolumeMuteIcon, VolumeIcon, SettingsIcon, FullscreenIcon,
  CheckIcon, CastIcon, CastConnectedIcon,
} from './Icons';
import { useChromecast } from './useChromecast';

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
  episodeUuid?: string;
}

interface NextEpisodeInfo {
  name: string;
  episodeNumber: number;
  seasonName: string;
  seriesName: string;
  fileUuid: string;
  episodeUuid: string;
  stillPath: string;
}

/* ─── GraphQL helper ─── */
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

const NEARBY_EPISODES = `query NearbyEpisodes($uuid: String!) {
  nearbyEpisodes(uuid: $uuid, previousLimit: 0, nextLimit: 1) {
    next {
      name
      episodeNumber
      uuid
      stillPath
      files { uuid }
      playState { finished playtime }
      season {
        name
        series { name }
      }
    }
  }
}`;

/* ─── Helpers ─── */
function tmdbImg(path: string, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

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

/** Known Chromecast-safe codecs (all generations of Cast devices). */
function getChromecastCodecsParams(): string {
  const codecs = [
    // H.264 profiles (up to High Profile Level 4.1)
    'avc1.640029', 'avc1.640028', 'avc1.4d4028', 'avc1.64001e', 'avc1.640020',
    // AAC
    'mp4a.40.2', 'mp4a.40.5',
    // Dolby Digital / Digital Plus
    'ac-3', 'ec-3',
    // Opus & Vorbis
    'opus', 'vorbis',
    // FLAC
    'flac',
  ];
  return codecs.map(c => `playableCodecs=${encodeURIComponent(c)}`).join('&');
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
  const showSettingsRef = useRef(false);
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

  // Next episode countdown
  const [nextEpisode, setNextEpisode] = useState<NextEpisodeInfo | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval>>(0 as unknown as ReturnType<typeof setInterval>);

  // Chromecast
  const {
    castState, castCurrentTime, castDuration, castPlaying,
    castError, requestSession, endSession, loadMedia,
    castPlay, castPause, castSeek,
  } = useChromecast();
  const isCasting = castState === 'connected';

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

  /* ─── Auto-load media to Chromecast when session connects ─── */
  useEffect(() => {
    if (!isCasting || !ticket) return;
    // Pause local playback
    const video = videoRef.current;
    if (video && !video.paused) video.pause();

    // Build absolute URL for the cast device.
    // The JWT is already inherently embedded in the hlsStreamingPath.
    // Use Chromecast-safe codecs rather than browser-probed ones.
    const codecParams = getChromecastCodecsParams();
    const separator = ticket.hlsStreamingPath.includes('?') ? '&' : '?';
    let streamUrl = `${window.location.origin}${ticket.hlsStreamingPath}`;
    if (codecParams) {
      streamUrl += `${separator}${codecParams}`;
    }

    loadMedia({
      contentUrl: streamUrl,
      title: state.title ?? 'Now Playing',
      subtitle: state.subtitle,
      startTime: video ? video.currentTime : (state.startTime ?? 0),
    });
  }, [isCasting, ticket]);

  /* ─── Save play state periodically (local + cast) ─── */
  useEffect(() => {
    if (!state.mediaUuid) return;
    const mediaUuid = state.mediaUuid;

    saveTimerRef.current = setInterval(() => {
      if (isCasting) {
        // Save cast playback position
        if (!castPlaying || !isFinite(castCurrentTime)) return;
        const finished = castDuration > 0 && (castDuration - castCurrentTime) < 30;
        gqlFetch(CREATE_PLAY_STATE, {
          uuid: mediaUuid,
          finished,
          playtime: Math.floor(castCurrentTime),
        }).catch(() => {});
      } else {
        const video = videoRef.current;
        if (!video || video.paused || !isFinite(video.currentTime)) return;
        const finished = video.duration > 0 && (video.duration - video.currentTime) < 30;
        gqlFetch(CREATE_PLAY_STATE, {
          uuid: mediaUuid,
          finished,
          playtime: Math.floor(video.currentTime),
        }).catch(() => {});
      }
    }, 10000);

    return () => clearInterval(saveTimerRef.current);
  }, [state.mediaUuid, isCasting, castPlaying, castCurrentTime, castDuration]);

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
    // If this is an episode, fetch next episode and start countdown
    if (state.episodeUuid) {
      gqlFetch<{ nearbyEpisodes: { next: Array<{
        name: string; episodeNumber: number; uuid: string; stillPath: string;
        files: Array<{ uuid: string }>;
        playState: { finished: boolean; playtime: number } | null;
        season: { name: string; series: { name: string } } | null;
      }> } }>(NEARBY_EPISODES, { uuid: state.episodeUuid })
        .then(data => {
          const next = data.nearbyEpisodes.next[0];
          if (next && next.files.length > 0) {
            setNextEpisode({
              name: next.name,
              episodeNumber: next.episodeNumber,
              seasonName: next.season?.name ?? '',
              seriesName: next.season?.series?.name ?? '',
              fileUuid: next.files[0].uuid,
              episodeUuid: next.uuid,
              stillPath: next.stillPath,
            });
            setCountdown(10);
            setShowCountdown(true);
          }
        })
        .catch(() => {});
    }
  }, [state.mediaUuid, state.episodeUuid]);

  /* ─── Next episode countdown timer ─── */
  useEffect(() => {
    if (!showCountdown || !nextEpisode) return;
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          playNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCountdown, nextEpisode]);

  function playNextEpisode() {
    if (!nextEpisode) return;
    clearInterval(countdownRef.current);
    setShowCountdown(false);
    navigate(`/play/${nextEpisode.fileUuid}`, {
      replace: true,
      state: {
        title: nextEpisode.name,
        subtitle: `${nextEpisode.seriesName} · ${nextEpisode.seasonName} · E${nextEpisode.episodeNumber}`,
        mediaUuid: nextEpisode.episodeUuid,
        episodeUuid: nextEpisode.episodeUuid,
        startTime: 0,
      },
    });
  }

  function cancelCountdown() {
    clearInterval(countdownRef.current);
    setShowCountdown(false);
    setNextEpisode(null);
    navigate(-1);
  }

  /* ─── Controls visibility ─── */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    if (showSettingsRef.current) return; // Keep controls up while settings are open
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 3000);
  }, []);

  // Sync ref and restart hide timer when settings close
  useEffect(() => {
    showSettingsRef.current = showSettings;
    if (!showSettings) {
      showControls();
    } else {
      clearTimeout(hideTimerRef.current);
    }
  }, [showSettings, showControls]);

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
    if (isCasting) {
      if (castPlaying) {
        castPause();
        flashCenter('pause');
      } else {
        castPlay();
        flashCenter('play');
      }
      showControls();
      return;
    }
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
    if (isCasting) {
      if (!castDuration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      castSeek(pct * castDuration);
      return;
    }
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
    if (isCasting) {
      castSeek(Math.max(0, castCurrentTime - 10));
      showControls();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 10);
    showControls();
  }

  function skipForward() {
    if (isCasting) {
      castSeek(Math.min(castDuration || Infinity, castCurrentTime + 30));
      showControls();
      return;
    }
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

  function handleCastButton() {
    if (castState === 'connected') {
      // Resume local playback from where cast left off
      const video = videoRef.current;
      if (video && isFinite(castCurrentTime) && castCurrentTime > 0) {
        video.currentTime = castCurrentTime;
      }
      endSession();
      if (video) video.play().catch(() => {});
    } else {
      requestSession();
    }
  }

  /* ─── Derived values ─── */
  const activeTime = isCasting ? castCurrentTime : currentTime;
  const activeDuration = isCasting ? castDuration : duration;
  const isPlaying = isCasting ? castPlaying : playing;
  const progressPct = activeDuration > 0 ? (activeTime / activeDuration) * 100 : 0;
  const bufferPct = isCasting ? 100 : (duration > 0 ? (buffered / duration) * 100 : 0);

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
        // If settings are open, close them instead of toggling play
        if (showSettings) {
          setShowSettings(false);
          setSettingsView('main');
          return;
        }
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

      {/* Casting overlay */}
      {isCasting && (
        <div className="cast-overlay">
          <CastConnectedIcon width={48} height={48} />
          <p className="cast-label">Casting to TV</p>
          <p className="cast-title">{state.title ?? 'Now Playing'}</p>
          {castError && <p className="cast-error">{castError}</p>}
        </div>
      )}

      {/* Center play/pause indicator */}
      <div className={`center-indicator${centerIcon ? ' visible' : ''}`}>
        {centerIcon === 'play' ? (
          <PlayIcon />
        ) : (
          <PauseIcon />
        )}
      </div>

      {/* Top overlay */}
      <div className="top-overlay">
        <button className="top-btn" title="Back" onClick={handleBack}>
          <ChevronLeftIcon />
        </button>
        <div className="now-playing">
          <h2>{state.title ?? 'Now Playing'}</h2>
          {state.subtitle && <p>{state.subtitle}</p>}
        </div>
        <div className="top-actions">
          {castState !== 'unavailable' && (
            <button
              className={`top-btn${isCasting ? ' cast-active' : ''}`}
              title={isCasting ? 'Stop Casting' : 'Cast'}
              onClick={handleCastButton}
            >
              {isCasting ? <CastConnectedIcon /> : <CastIcon />}
            </button>
          )}
          {!isCasting && (
            <button className="top-btn" title="Picture in Picture" onClick={() => {
              videoRef.current?.requestPictureInPicture?.().catch(() => {});
            }}>
              <PipIcon />
            </button>
          )}
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
            <SkipBackIcon />
          </button>

          <button className="ctrl-btn play-pause" title={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay}>
            {isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </button>

          <button className="ctrl-btn" title="Forward 30s" onClick={skipForward}>
            <SkipForwardIcon />
          </button>

          <span className="time-display">
            <span className="current">{formatTime(activeTime)}</span> / {formatTime(activeDuration)}
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
              <SubtitlesIcon />
            </button>
          )}

          {/* Volume */}
          <div className="volume-group">
            <button className="ctrl-btn" title="Volume" onClick={toggleMute}>
              {muted || volume === 0 ? (
                <VolumeMuteIcon />
              ) : (
                <VolumeIcon />
              )}
            </button>
            <div className="volume-slider">
              <input type="range" min="0" max="100" value={muted ? 0 : volume} onChange={handleVolumeChange} />
            </div>
          </div>

          {/* Settings */}
          <button className="ctrl-btn" title="Settings" onClick={() => { setShowSettings(s => !s); setSettingsView('main'); }}>
            <SettingsIcon />
          </button>

          {/* Cast */}
          {castState !== 'unavailable' && (
            <button
              className={`ctrl-btn${isCasting ? ' cast-active' : ''}`}
              title={isCasting ? 'Stop Casting' : 'Cast'}
              onClick={handleCastButton}
            >
              {isCasting ? <CastConnectedIcon /> : <CastIcon />}
            </button>
          )}

          {/* Fullscreen */}
          <button className="ctrl-btn" title="Fullscreen" onClick={toggleFullscreen}>
            <FullscreenIcon />
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
                <span className="sp-value">{currentQualityLabel} <ChevronRightIcon width={14} height={14} /></span>
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
                  <span className="sp-value">{currentSubtitleLabel} <ChevronRightIcon width={14} height={14} /></span>
                </div>
              )}
              <div className="sp-divider" />
              <div className="sp-item" onClick={() => setSettingsView('speed')}>
                <span className="sp-label">Playback Speed</span>
                <span className="sp-value">{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`} <ChevronRightIcon width={14} height={14} /></span>
              </div>
            </>
          )}

          {settingsView === 'quality' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <ChevronLeftIcon width={16} height={16} />
                <span>Quality</span>
              </div>
              <div className="sp-divider" />
              <div className={`sp-option${selectedQuality === -1 ? ' active' : ''}`} onClick={() => switchQuality(-1)}>
                <span>Auto</span>
                {selectedQuality === -1 && <CheckIcon width={16} height={16} />}
              </div>
              {qualityLevels.map(level => (
                <div key={level.index} className={`sp-option${selectedQuality === level.index ? ' active' : ''}`} onClick={() => switchQuality(level.index)}>
                  <span>{level.label}</span>
                  <span className="sp-bitrate">{(level.bitrate / 1_000_000).toFixed(1)} Mbps</span>
                  {selectedQuality === level.index && <CheckIcon width={16} height={16} />}
                </div>
              ))}
            </>
          )}

          {settingsView === 'subtitles' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <ChevronLeftIcon width={16} height={16} />
                <span>Subtitles</span>
              </div>
              <div className="sp-divider" />
              <div className={`sp-option${selectedSubtitle === -1 ? ' active' : ''}`} onClick={() => switchSubtitle(-1)}>
                <span>Off</span>
                {selectedSubtitle === -1 && <CheckIcon width={16} height={16} />}
              </div>
              {subtitleTracks.map(track => (
                <div key={track.index} className={`sp-option${selectedSubtitle === track.index ? ' active' : ''}`} onClick={() => switchSubtitle(track.index)}>
                  <span>{track.name}</span>
                  {track.lang && <span className="sp-lang">{track.lang.toUpperCase()}</span>}
                  {selectedSubtitle === track.index && <CheckIcon width={16} height={16} />}
                </div>
              ))}
            </>
          )}

          {settingsView === 'speed' && (
            <>
              <div className="sp-header" onClick={() => setSettingsView('main')}>
                <ChevronLeftIcon width={16} height={16} />
                <span>Playback Speed</span>
              </div>
              <div className="sp-divider" />
              {speedOptions.map(s => (
                <div key={s} className={`sp-option${playbackSpeed === s ? ' active' : ''}`} onClick={() => changeSpeed(s)}>
                  <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                  {playbackSpeed === s && <CheckIcon width={16} height={16} />}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Next episode countdown overlay */}
      {showCountdown && nextEpisode && (
        <div className="next-episode-overlay">
          <div className="next-episode-card">
            {nextEpisode.stillPath && (
              <img
                className="next-episode-still"
                src={tmdbImg(nextEpisode.stillPath, 'w300')}
                alt={nextEpisode.name}
                onLoad={e => e.currentTarget.classList.add('loaded')}
              />
            )}
            <div className="next-episode-info">
              <span className="next-episode-label">Up Next</span>
              <h3 className="next-episode-title">{nextEpisode.name}</h3>
              <p className="next-episode-meta">
                {nextEpisode.seriesName} · {nextEpisode.seasonName} · E{nextEpisode.episodeNumber}
              </p>
            </div>
          </div>
          <div className="next-episode-actions">
            <div className="next-episode-countdown-ring">
              <svg viewBox="0 0 48 48">
                <circle className="countdown-track" cx="24" cy="24" r="20" />
                <circle
                  className="countdown-progress"
                  cx="24" cy="24" r="20"
                  style={{ strokeDashoffset: `${125.6 * (1 - countdown / 10)}` }}
                />
              </svg>
              <span className="countdown-number">{countdown}</span>
            </div>
            <button className="next-episode-play" onClick={playNextEpisode}>
              <PlayIcon width={18} height={18} />
              Play Now
            </button>
            <button className="next-episode-cancel" onClick={cancelCountdown}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
