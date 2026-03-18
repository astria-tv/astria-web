import { useEffect, useState, useCallback } from 'react';
import './ActiveStreams.css';

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
  const jwt = sessionStorage.getItem('jwt');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function isCurrentUserAdmin(): boolean {
  const jwt = sessionStorage.getItem('jwt');
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
      const data = await gqlFetch<{ users: { id: number; username: string }[] }>('/olaris/m/query', USERS_QUERY);
      const map: Record<number, string> = {};
      for (const u of data.users) map[u.id] = u.username;
      setUserMap(map);
    } catch {
      // Non-critical — fall back to showing user IDs
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await gqlFetch<{ sessions: Session[] }>('/olaris/s/query', SESSIONS_QUERY);
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <span className="refresh-label">Updated {lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ─── Sessions ─── */}
      {sessions.length === 0 ? (
        <div className="admin-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <FileName locator={session.fileLocator} />
                  </div>
                  <div className="session-meta">
                    <span className="session-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      {userMap[session.userID] ?? `User ${session.userID}`}
                    </span>
                    <span className="session-meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {formatProgress(session.progress)}
                    </span>
                  </div>
                </div>
                <div className="session-status">
                  <span className={`session-badge ${session.paused ? 'badge-paused' : 'badge-playing'}`}>
                    {session.paused ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
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
