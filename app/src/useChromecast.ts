/**
 * Chromecast hook using Google Cast Web Sender SDK.
 *
 * Uses the Default Media Receiver so no custom receiver app is needed.
 * Streams HLS content from the server to the Chromecast device.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

/* ─── Global type declarations for the Cast SDK ─── */
declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: typeof cast;
    chrome?: { cast?: typeof chrome.cast };
  }
}

declare namespace cast {
  namespace framework {
    class CastContext {
      static getInstance(): CastContext;
      setOptions(options: {
        receiverApplicationId: string;
        autoJoinPolicy: string;
      }): void;
      requestSession(): Promise<void>;
      endCurrentSession(stopCasting: boolean): void;
      getCurrentSession(): CastSession | null;
      addEventListener(
        type: string,
        handler: (event: { sessionState: string }) => void,
      ): void;
      removeEventListener(
        type: string,
        handler: (event: { sessionState: string }) => void,
      ): void;
    }
    class CastSession {
      getMediaSession(): chrome.cast.media.Media | null;
    }
    enum SessionState {
      NO_SESSION = 'NO_SESSION',
      SESSION_STARTING = 'SESSION_STARTING',
      SESSION_STARTED = 'SESSION_STARTED',
      SESSION_START_FAILED = 'SESSION_START_FAILED',
      SESSION_ENDING = 'SESSION_ENDING',
      SESSION_ENDED = 'SESSION_ENDED',
      SESSION_RESUMED = 'SESSION_RESUMED',
    }
    enum CastContextEventType {
      SESSION_STATE_CHANGED = 'SESSION_STATE_CHANGED',
    }
  }
}

declare namespace chrome {
  namespace cast {
    const AutoJoinPolicy: { ORIGIN_SCOPED: string };
    namespace media {
      class MediaInfo {
        constructor(contentId: string, contentType: string);
        hlsSegmentFormat: string;
        customData: Record<string, unknown>;
        metadata: GenericMediaMetadata;
        streamType: string;
        currentTime: number;
      }
      const HlsSegmentFormat: { FMP4: string };
      const StreamType: { BUFFERED: string };
      class GenericMediaMetadata {
        title: string;
        subtitle: string;
        images: Array<{ url: string }>;
        metadataType: number;
      }
      const MetadataType: { GENERIC: number; MOVIE: number; TV_SHOW: number };
      class LoadRequest {
        constructor(mediaInfo: MediaInfo);
        currentTime: number;
        autoplay: boolean;
      }
      class Media {
        currentTime: number;
        duration: number;
        playerState: string;
        getEstimatedTime(): number;
        play(
          request: GenericMediaCommand | null,
          onSuccess: () => void,
          onError: () => void,
        ): void;
        pause(
          request: GenericMediaCommand | null,
          onSuccess: () => void,
          onError: () => void,
        ): void;
        seek(request: SeekRequest): void;
        stop(
          request: GenericMediaCommand | null,
          onSuccess: () => void,
          onError: () => void,
        ): void;
        addUpdateListener(listener: (isAlive: boolean) => void): void;
        removeUpdateListener(listener: (isAlive: boolean) => void): void;
      }
      class GenericMediaCommand {}
      class SeekRequest {
        currentTime: number;
      }
      const PlayerState: {
        IDLE: string;
        PLAYING: string;
        PAUSED: string;
        BUFFERING: string;
      };
    }
  }
}

/* ─── Types ─── */
export type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

export interface CastMediaInfo {
  /** Full URL to the HLS manifest (JWT should be embedded as a query param) */
  contentUrl: string;
  /** Title shown on the cast device */
  title: string;
  /** Subtitle (e.g. series · season · episode) */
  subtitle?: string;
  /** Poster or still image URL */
  posterUrl?: string;
  /** Where to start playback in seconds */
  startTime?: number;
}

/* ─── Hook ─── */
export function useChromecast() {
  const [castState, setCastState] = useState<CastState>('unavailable');
  const [castCurrentTime, setCastCurrentTime] = useState(0);
  const [castDuration, setCastDuration] = useState(0);
  const [castPlaying, setCastPlaying] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    // If the Cast SDK is already loaded, initialize immediately
    if (window.cast?.framework) {
      initCast();
      return;
    }

    // Otherwise wait for the SDK callback
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) initCast();
    };

    return () => {
      window.__onGCastApiAvailable = undefined;
    };
  }, []);

  function initCast() {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: 'A078927C',
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    setCastState('available');
    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      handleSessionStateChange,
    );
  }

  function handleSessionStateChange(event: { sessionState: string }) {
    const { SessionState } = cast.framework;
    switch (event.sessionState) {
      case SessionState.SESSION_STARTED:
      case SessionState.SESSION_RESUMED:
        setCastState('connected');
        break;
      case SessionState.SESSION_STARTING:
        setCastState('connecting');
        break;
      case SessionState.SESSION_ENDED:
      case SessionState.SESSION_START_FAILED:
        setCastState('available');
        setCastPlaying(false);
        stopPolling();
        break;
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(() => {
      const session = cast.framework.CastContext.getInstance().getCurrentSession();
      const media = session?.getMediaSession();
      if (!media) return;
      setCastCurrentTime(media.getEstimatedTime?.() ?? media.currentTime ?? 0);
      setCastDuration(media.duration ?? 0);
      setCastPlaying(
        media.playerState === chrome.cast.media.PlayerState.PLAYING ||
        media.playerState === chrome.cast.media.PlayerState.BUFFERING,
      );
    }, 1000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  const requestSession = useCallback(async () => {
    if (!window.cast?.framework) return;
    try {
      await cast.framework.CastContext.getInstance().requestSession();
    } catch {
      // User cancelled or error
    }
  }, []);

  const endSession = useCallback(() => {
    if (!window.cast?.framework) return;
    stopPolling();
    cast.framework.CastContext.getInstance().endCurrentSession(true);
    setCastState('available');
    setCastPlaying(false);
  }, []);

  const loadMedia = useCallback(
    (info: CastMediaInfo) => {
      const session = cast.framework.CastContext.getInstance().getCurrentSession();
      if (!session) return;

      const mediaInfo = new chrome.cast.media.MediaInfo(
        info.contentUrl,
        'application/x-mpegURL',
      );
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
      mediaInfo.hlsSegmentFormat = chrome.cast.media.HlsSegmentFormat.FMP4;

      const metadata = new chrome.cast.media.GenericMediaMetadata();
      metadata.title = info.title;
      metadata.subtitle = info.subtitle ?? '';
      metadata.metadataType = chrome.cast.media.MetadataType.GENERIC;
      if (info.posterUrl) {
        metadata.images = [{ url: info.posterUrl }];
      }
      mediaInfo.metadata = metadata;

      const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
      loadRequest.currentTime = info.startTime ?? 0;
      loadRequest.autoplay = true;

      session
        .getMediaSession()
        ?.stop(null, () => {}, () => {});

      // Use the session to load - the cast SDK handles this
      const castSession = cast.framework.CastContext.getInstance().getCurrentSession() as unknown as {
        loadMedia(req: chrome.cast.media.LoadRequest): Promise<void>;
      };
      setCastError(null);
      castSession.loadMedia(loadRequest).then(() => {
        startPolling();
        setCastPlaying(true);
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err ?? 'Cast media load failed');
        console.error('[Chromecast] Failed to load media:', message);
        setCastError(message);
      });
    },
    [],
  );

  const castPlay = useCallback(() => {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    const media = session?.getMediaSession();
    media?.play(null, () => setCastPlaying(true), () => {});
  }, []);

  const castPause = useCallback(() => {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    const media = session?.getMediaSession();
    media?.pause(null, () => setCastPlaying(false), () => {});
  }, []);

  const castSeek = useCallback((time: number) => {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    const media = session?.getMediaSession();
    if (!media) return;
    const request = new chrome.cast.media.SeekRequest();
    request.currentTime = time;
    media.seek(request);
  }, []);

  const castStop = useCallback(() => {
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    const media = session?.getMediaSession();
    media?.stop(null, () => {
      setCastPlaying(false);
      stopPolling();
    }, () => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  return {
    castState,
    castCurrentTime,
    castDuration,
    castPlaying,
    castError,
    requestSession,
    endSession,
    loadMedia,
    castPlay,
    castPause,
    castSeek,
    castStop,
  };
}
