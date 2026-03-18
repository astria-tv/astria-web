import { useEffect, useState, useCallback } from 'react';
import './AdminSettings.css';

/* ─── Types ─── */
interface User {
  id: number;
  username: string;
  admin: boolean;
}

interface Invite {
  code: string;
  user: User | null;
}

interface InviteResponse {
  code: string;
  error: { message: string; hasError: boolean } | null;
}

/* ─── GraphQL ─── */
const ADMIN_QUERY = `{
  users { id username admin }
  invites { code user { id username admin } }
}`;

const CREATE_INVITE_MUTATION = `mutation { createUserInvite { code error { message hasError } } }`;

const DELETE_USER_MUTATION = `mutation DeleteUser($id: Int!) { deleteUser(id: $id) { user { id } error { message hasError } } }`;

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

/* ─── Component ─── */
export default function AdminSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await gqlFetch<{ users: User[]; invites: Invite[] }>(ADMIN_QUERY);
      setUsers(data.users ?? []);
      setInvites(data.invites ?? []);

      // Verify admin status from server data + JWT
      const jwt = sessionStorage.getItem('jwt');
      if (jwt) {
        const payload = parseJwt(jwt);
        const uname = payload?.username as string | undefined;
        setCurrentUsername(uname ?? null);
        const currentUser = data.users.find(u => u.username === uname);
        setIsAdmin(currentUser?.admin ?? isCurrentUserAdmin());
      } else {
        setIsAdmin(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setIsAdmin(isCurrentUserAdmin());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreateInvite() {
    setCreating(true);
    setError('');
    setNewCode(null);
    try {
      const data = await gqlFetch<{ createUserInvite: InviteResponse }>(CREATE_INVITE_MUTATION);
      const result = data.createUserInvite;
      if (result.error?.hasError) {
        setError(result.error.message);
      } else {
        setNewCode(result.code);
        // Refresh the invites list
        const refreshed = await gqlFetch<{ users: User[]; invites: Invite[] }>(ADMIN_QUERY);
        setInvites(refreshed.invites ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(userId: number) {
    setDeletingUserId(userId);
    setError('');
    try {
      const data = await gqlFetch<{ deleteUser: { user: User | null; error: { message: string; hasError: boolean } | null } }>(DELETE_USER_MUTATION, { id: userId });
      if (data.deleteUser.error?.hasError) {
        setError(data.deleteUser.error.message);
      } else {
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
      setConfirmDeleteId(null);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: select the text element if clipboard API fails
    }
  }

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

  const availableInvites = invites.filter(i => !i.user);

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Settings</h1>
        <p>Manage users and invitation links for your server</p>
      </div>

      {error && (
        <div className="admin-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          {error}
        </div>
      )}

      {/* ─── Create Invite ─── */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Invitation Links</h2>
        </div>
        <p className="admin-section-desc">
          Generate invite codes to allow others to create an account on your server.
        </p>
        <div className="invite-actions">
          <button className="btn-create" onClick={handleCreateInvite} disabled={creating}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {creating ? 'Generating…' : 'Generate Invite Code'}
          </button>
        </div>

        {newCode && (
          <div className="invite-created">
            <span className="invite-created-label">New code:</span>
            <span className="invite-created-code">{newCode}</span>
            <button
              className={`btn-copy${copied === newCode ? ' copied' : ''}`}
              onClick={() => copyToClipboard(newCode)}
            >
              {copied === newCode ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                  Copied
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  Copy
                </>
              )}
            </button>
          </div>
        )}

        {/* Available Invites */}
        <div className="admin-table-wrap">
          {availableInvites.length === 0 ? (
            <div className="admin-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
              <p>No invites yet</p>
              <span>Generate an invite code to get started</span>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invite Code</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {availableInvites.map(invite => (
                  <tr key={invite.code}>
                    <td className="invite-code-cell">{invite.code}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`table-copy-btn${copied === invite.code ? ' copied' : ''}`}
                        onClick={() => copyToClipboard(invite.code!)}
                        title="Copy invite code"
                      >
                        {copied === invite.code ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Users ─── */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Users</h2>
        </div>
        <p className="admin-section-desc">
          All registered users on this server.
        </p>
        <div className="admin-table-wrap">
          {users.length === 0 ? (
            <div className="admin-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <p>No users found</p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>
                      <span className={`badge ${user.admin ? 'badge-admin' : 'badge-user'}`}>
                        {user.admin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {user.username !== currentUsername && (
                        confirmDeleteId === user.id ? (
                          <span className="confirm-delete">
                            <span className="confirm-delete-label">Delete?</span>
                            <button
                              className="btn-confirm-yes"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deletingUserId === user.id}
                            >
                              {deletingUserId === user.id ? '…' : 'Yes'}
                            </button>
                            <button
                              className="btn-confirm-no"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            className="btn-delete-user"
                            onClick={() => setConfirmDeleteId(user.id)}
                            title={`Delete ${user.username}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
