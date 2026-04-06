import { useEffect, useState, useCallback } from 'react';
import { getJwt, parseJwt, handleAuthFailure } from './auth';
import './ActiveStreams.css';
import {
  LockIcon, ErrorCircleIcon, RefreshIcon, MediaPlayIcon,
  VideoIcon, UserIcon, ClockIcon, PauseOutlineIcon, PlayOutlineIcon,
} from './Icons';

/* ─── Types ─── */
interface StreamInfo {
  streamID: number;
  streamType: string;
  transcodingPercentage: number;
  throttled: boolean;
  transcoded: boolean;
  transmuxed: boolean;
  transcodingState: string;
  container: string;
  resolution: string;
  codecs: string;
  codecName: string;
  language: string;
  title: string;
  bitRate: number;
  lastAccessed: string;
}

interface Session {
  sessionID: string;
  fileLocator: string;
  userID: number;
  paused: boolean;
  progress: number;
  streams: StreamInfo[];
}

/* ─── GraphQL ─── */
const USERS_QUERY = `{ users { id username } }`;

const SESSIONS_QUERY = `{
  sessions {
    sessionID
    fileLocator
    userID
    paused
    progress
    streams {
      streamID
      streamType
      transcodingPercentage
      throttled
      transcoded
      transmuxed
      transcodingState
      container
      resolution
      codecs
      codecName
      language
      title
      bitRate
      lastAccessed
    }
  }
}`;

async function gqlFetch<T>(endpoint: string, query: string): Promise<T> {
  const jwt = getJwt();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function isCurrentUserAdmin(): boolean {
  const jwt = getJwt();
  if (!jwt) return false;
  const payload = parseJwt(jwt);
  if (!payload) return false;
  return payload.admin === true;
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

function formatProgress(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stateLabel(state: string): string {
  switch (state) {
    case 'RUNNING': return 'Running';
    case 'THROTTLED': return 'Throttled';
    case 'NEW': return 'Starting';
    case 'STOPPING': return 'Stopping';
    case 'EXITED': return 'Finished';
    default: return state;
  }
}

function stateClass(state: string): string {
  switch (state) {
    case 'RUNNING': return 'state-running';
    case 'THROTTLED': return 'state-throttled';
    case 'NEW': return 'state-new';
    case 'STOPPING': return 'state-stopping';
    case 'EXITED': return 'state-exited';
    default: return '';
  }
}

function FileName({ locator }: { locator: string }) {
  const name = locator.split(/[/\\]/).pop() || locator;
  return <span className="stream-filename" title={locator}>{name}</span>;
}

/* ─── Component ─── */
export default function ActiveStreams() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userMap, setUserMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchUsers = useCallback(async () => {
    try {
      const data = await gqlFetch<{ users: { id: number; username: string }[] }>('/astria/m/query', USERS_QUERY);
      const map: Record<number, string> = {};
      for (const u of data.users) map[u.id] = u.username;
      setUserMap(map);
    } catch {
      // Non-critical — fall back to showing user IDs
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await gqlFetch<{ sessions: Session[] }>('/astria/s/query', SESSIONS_QUERY);
      setSessions(data.sessions ?? []);
      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsAdmin(isCurrentUserAdmin());
    fetchUsers();
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchUsers, fetchSessions]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="access-denied">
        <LockIcon strokeWidth={1.5} />
        <h2>Access Denied</h2>
        <p>You need administrator privileges to view this page.</p>
      </div>
    );
  }

  const totalStreams = sessions.reduce((sum, s) => sum + s.streams.length, 0);

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Active Streams</h1>
        <p>Monitor current transcoding sessions on your server</p>
      </div>

      {error && (
        <div className="admin-error">
          <ErrorCircleIcon />
          {error}
        </div>
      )}

      {/* ─── Stats Bar ─── */}
      <div className="streams-stats">
        <div className="stat-card">
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-label">Active {sessions.length === 1 ? 'Session' : 'Sessions'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalStreams}</div>
          <div className="stat-label">Total {totalStreams === 1 ? 'Stream' : 'Streams'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sessions.filter(s => s.paused).length}</div>
          <div className="stat-label">Paused</div>
        </div>
        <div className="stat-refresh">
          <button className="btn-refresh" onClick={fetchSessions} title="Refresh now">
            <RefreshIcon />
          </button>
          <span className="refresh-label">Updated {lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ─── Sessions ─── */}
      {sessions.length === 0 ? (
        <div className="admin-empty">
          <MediaPlayIcon strokeWidth={1.5} />
          <p>No active streams</p>
          <span>Streams will appear here when someone starts watching</span>
        </div>
      ) : (
        <div className="sessions-list">
          {[...sessions].sort((a, b) => a.sessionID.localeCompare(b.sessionID)).map((session, idx) => (
            <div className="session-card" key={session.sessionID} style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="session-header">
                <div className="session-info">
                  <div className="session-file">
                    <VideoIcon />
                    <FileName locator={session.fileLocator} />
                  </div>
                  <div className="session-meta">
                    <span className="session-meta-item">
                      <UserIcon />
                      {userMap[session.userID] ?? `User ${session.userID}`}
                    </span>
                    <span className="session-meta-item">
                      <ClockIcon />
                      {formatProgress(session.progress)}
                    </span>
                  </div>
                </div>
                <div className="session-status">
                  <span className={`session-badge ${session.paused ? 'badge-paused' : 'badge-playing'}`}>
                    {session.paused ? (
                      <PauseOutlineIcon />
                    ) : (
                      <PlayOutlineIcon />
                    )}
                    {session.paused ? 'Paused' : 'Playing'}
                  </span>
                </div>
              </div>

              {/* ─── Stream Details Table ─── */}
              <div className="admin-table-wrap stream-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Codec</th>
                      <th>Resolution</th>
                      <th>Bitrate</th>
                      <th>Mode</th>
                      <th>Progress</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...session.streams].sort((a, b) => a.streamID - b.streamID).map(stream => (
                      <tr key={stream.streamID}>
                        <td>
                          <span className={`stream-type-badge type-${stream.streamType.toLowerCase()}`}>
                            {stream.streamType}
                          </span>
                        </td>
                        <td className="stream-codec">{stream.codecName || stream.codecs}</td>
                        <td>{stream.resolution || '—'}</td>
                        <td>{stream.bitRate ? formatBitrate(stream.bitRate) : '—'}</td>
                        <td>
                          <span className={`badge ${stream.transcoded ? 'badge-transcoded' : 'badge-transmuxed'}`}>
                            {stream.transcoded ? 'Transcode' : 'Transmux'}
                          </span>
                        </td>
                        <td>
                          <div className="progress-cell">
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{ width: `${Math.min(stream.transcodingPercentage, 100)}%` }}
                              />
                            </div>
                            <span className="progress-pct">{stream.transcodingPercentage}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${stateClass(stream.transcodingState)}`}>
                            {stateLabel(stream.transcodingState)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
