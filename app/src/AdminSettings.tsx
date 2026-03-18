import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

interface Library {
  id: number;
  kind: number;
  name: string;
  filePath: string;
  isRefreshing: boolean;
  backend: number;
  rcloneName: string | null;
  healthy: boolean;
}

/* ─── GraphQL ─── */
const ADMIN_QUERY = `{
  users { id username admin }
  invites { code user { id username admin } }
  libraries { id kind name filePath isRefreshing backend rcloneName healthy }
}`;

const CREATE_INVITE_MUTATION = `mutation { createUserInvite { code error { message hasError } } }`;

const DELETE_USER_MUTATION = `mutation DeleteUser($id: Int!) { deleteUser(id: $id) { user { id } error { message hasError } } }`;

const REMOTES_QUERY = `{ remotes }`;

const FOLDERS_QUERY = `query Folders($path: String!) { folders(path: $path, fullPath: false) }`;

const CREATE_LIBRARY_MUTATION = `mutation CreateLibrary($name: String!, $filePath: String!, $kind: Int!, $backend: Int!, $rcloneName: String) {
  createLibrary(name: $name, filePath: $filePath, kind: $kind, backend: $backend, rcloneName: $rcloneName) {
    library { id name filePath kind backend rcloneName healthy }
    error { message hasError }
  }
}`;

const DELETE_LIBRARY_MUTATION = `mutation DeleteLibrary($id: Int!) {
  deleteLibrary(id: $id) {
    library { id }
    error { message hasError }
  }
}`;

const RESCAN_LIBRARY_MUTATION = `mutation RescanLibrary($id: Int!) {
  rescanLibrary(id: $id)
}`;

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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'libraries' ? 'libraries' : 'users';
  const [activeTab, setActiveTab] = useState<'users' | 'libraries'>(initialTab);

  /* ── Shared state ── */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  /* ── Users & Invites state ── */
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  /* ── Libraries state ── */
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [libName, setLibName] = useState('');
  const [libKind, setLibKind] = useState(0);
  const [libBackend, setLibBackend] = useState(0);
  const [libPath, setLibPath] = useState('');
  const [libRcloneName, setLibRcloneName] = useState('');
  const [remotes, setRemotes] = useState<string[]>([]);
  const [remotesLoaded, setRemotesLoaded] = useState(false);
  const [remotesLoading, setRemotesLoading] = useState(false);
  const [creatingLib, setCreatingLib] = useState(false);
  const [confirmDeleteLibId, setConfirmDeleteLibId] = useState<number | null>(null);
  const [deletingLibId, setDeletingLibId] = useState<number | null>(null);
  const [rescanningLibId, setRescanningLibId] = useState<number | null>(null);

  /* ── Folder browser state ── */
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserLocator, setBrowserLocator] = useState('');
  const [browserFolders, setBrowserFolders] = useState<string[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState('');

  /* ── Data fetching ── */
  const fetchData = useCallback(async () => {
    try {
      const data = await gqlFetch<{ users: User[]; invites: Invite[]; libraries: Library[] }>(ADMIN_QUERY);
      setUsers(data.users ?? []);
      setInvites(data.invites ?? []);
      setLibraries(data.libraries ?? []);

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

  /* ── Invite handlers ── */
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
        const refreshed = await gqlFetch<{ users: User[]; invites: Invite[]; libraries: Library[] }>(ADMIN_QUERY);
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
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  /* ── Library handlers ── */
  function resetLibraryForm() {
    setLibName('');
    setLibKind(0);
    setLibBackend(0);
    setLibPath('');
    setLibRcloneName('');
    setShowBrowser(false);
    setBrowserLocator('');
    setBrowserFolders([]);
    setBrowserError('');
  }

  function openAddModal() {
    resetLibraryForm();
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    resetLibraryForm();
  }

  async function loadRemotes() {
    if (remotesLoaded) return;
    setRemotesLoading(true);
    try {
      const data = await gqlFetch<{ remotes: string[] }>(REMOTES_QUERY);
      setRemotes(data.remotes ?? []);
      setRemotesLoaded(true);
    } catch {
      // Silently handle — user can still type manually
    } finally {
      setRemotesLoading(false);
    }
  }

  async function loadBrowserFolders(locatorPath: string) {
    setBrowserLoading(true);
    setBrowserError('');
    try {
      const data = await gqlFetch<{ folders: string[] }>(FOLDERS_QUERY, { path: locatorPath });
      setBrowserFolders(data.folders ?? []);
    } catch (err) {
      setBrowserError(err instanceof Error ? err.message : 'Failed to load folders');
      setBrowserFolders([]);
    } finally {
      setBrowserLoading(false);
    }
  }

  function openBrowser() {
    let startPath: string;
    if (libBackend === 0) {
      startPath = 'local#/';
    } else {
      if (!libRcloneName) return;
      startPath = `rclone#${libRcloneName}/`;
    }
    setBrowserLocator(startPath);
    setShowBrowser(true);
    loadBrowserFolders(startPath);
  }

  function navigateToFolder(folderName: string) {
    const newLocator = browserLocator + folderName + '/';
    setBrowserLocator(newLocator);
    loadBrowserFolders(newLocator);
  }

  function navigateToBreadcrumb(targetLocator: string) {
    setBrowserLocator(targetLocator);
    loadBrowserFolders(targetLocator);
  }

  function selectCurrentFolder() {
    if (libBackend === 0) {
      setLibPath(browserLocator.replace(/^local#/, ''));
    } else {
      const afterPrefix = browserLocator.replace(/^rclone#/, '');
      const slashIdx = afterPrefix.indexOf('/');
      setLibPath(slashIdx >= 0 ? afterPrefix.slice(slashIdx) : '/');
    }
    setShowBrowser(false);
  }

  function getBreadcrumbs(): { label: string; locator: string }[] {
    let prefix: string;
    let pathPart: string;

    if (libBackend === 0) {
      prefix = 'local#';
      pathPart = browserLocator.replace(/^local#/, '');
    } else {
      const afterRclone = browserLocator.replace(/^rclone#/, '');
      const slashIdx = afterRclone.indexOf('/');
      const remoteName = slashIdx >= 0 ? afterRclone.slice(0, slashIdx) : afterRclone;
      prefix = `rclone#${remoteName}`;
      pathPart = slashIdx >= 0 ? afterRclone.slice(slashIdx) : '/';
    }

    const segments = pathPart.split('/').filter(Boolean);
    const crumbs: { label: string; locator: string }[] = [
      { label: '/', locator: prefix + '/' },
    ];

    let cumulative = '/';
    for (const seg of segments) {
      cumulative += seg + '/';
      crumbs.push({ label: seg, locator: prefix + cumulative });
    }

    return crumbs;
  }

  async function handleCreateLibrary() {
    if (!libName.trim() || !libPath.trim()) return;
    setCreatingLib(true);
    setError('');
    try {
      const variables: Record<string, unknown> = {
        name: libName.trim(),
        filePath: libPath.trim(),
        kind: libKind,
        backend: libBackend,
      };
      if (libBackend === 1 && libRcloneName) {
        variables.rcloneName = libRcloneName;
      }
      const data = await gqlFetch<{ createLibrary: { library: Library | null; error: { message: string; hasError: boolean } | null } }>(
        CREATE_LIBRARY_MUTATION, variables,
      );
      if (data.createLibrary.error?.hasError) {
        setError(data.createLibrary.error.message);
      } else {
        closeAddModal();
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create library');
    } finally {
      setCreatingLib(false);
    }
  }

  async function handleDeleteLibrary(id: number) {
    setDeletingLibId(id);
    setError('');
    try {
      const data = await gqlFetch<{ deleteLibrary: { library: { id: number } | null; error: { message: string; hasError: boolean } | null } }>(
        DELETE_LIBRARY_MUTATION, { id },
      );
      if (data.deleteLibrary.error?.hasError) {
        setError(data.deleteLibrary.error.message);
      } else {
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete library');
    } finally {
      setDeletingLibId(null);
      setConfirmDeleteLibId(null);
    }
  }

  async function handleRescanLibrary(id: number) {
    setRescanningLibId(id);
    try {
      await gqlFetch<{ rescanLibrary: boolean }>(RESCAN_LIBRARY_MUTATION, { id });
      await fetchData();
    } catch {
      // Refresh state will update on next fetch
    } finally {
      setRescanningLibId(null);
    }
  }

  /* ── Effects ── */
  useEffect(() => {
    if (libBackend === 1 && !remotesLoaded) {
      loadRemotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libBackend]);

  useEffect(() => {
    setShowBrowser(false);
    setLibPath('');
    if (libBackend === 0) setLibRcloneName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libBackend]);

  useEffect(() => {
    if (!showAddModal) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAddModal();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal]);

  /* ── Render ── */
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
        <p>Manage users, invitations, and media libraries</p>
      </div>

      {/* ─── Tabs ─── */}
      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === 'users' ? ' active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Users & Invites
        </button>
        <button
          className={`admin-tab${activeTab === 'libraries' ? ' active' : ''}`}
          onClick={() => setActiveTab('libraries')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
          Libraries
        </button>
      </div>

      {error && (
        <div className="admin-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          {error}
        </div>
      )}

      {/* ═══════════ USERS & INVITES TAB ═══════════ */}
      {activeTab === 'users' && (
        <>
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
        </>
      )}

      {/* ═══════════ LIBRARIES TAB ═══════════ */}
      {activeTab === 'libraries' && (
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Media Libraries</h2>
            <button className="btn-create" onClick={openAddModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Library
            </button>
          </div>
          <p className="admin-section-desc">
            Configure where your media files are located. Each library contains either movies or series.
          </p>

          {libraries.length === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                <p>No libraries configured</p>
                <span>Add a library to start scanning your media</span>
              </div>
            </div>
          ) : (
            <div className="lib-grid">
              {libraries.map(lib => (
                <div key={lib.id} className={`lib-card${!lib.healthy ? ' lib-unhealthy' : ''}`}>
                  <div className="lib-card-header">
                    <div className="lib-card-icon">
                      {lib.kind === 0 ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>
                      )}
                    </div>
                    <div className="lib-card-info">
                      <h3>{lib.name}</h3>
                      <span className="lib-card-path">
                        {lib.backend === 1 && lib.rcloneName ? `${lib.rcloneName}:` : ''}{lib.filePath}
                      </span>
                    </div>
                    <div className="lib-card-badges">
                      <span className={`badge ${lib.kind === 0 ? 'badge-movies' : 'badge-series'}`}>
                        {lib.kind === 0 ? 'Movies' : 'Series'}
                      </span>
                      <span className={`badge ${lib.backend === 0 ? 'badge-local' : 'badge-rclone'}`}>
                        {lib.backend === 0 ? 'Local' : 'Rclone'}
                      </span>
                    </div>
                  </div>
                  <div className="lib-card-footer">
                    <div className="lib-card-status">
                      <span className={`status-dot${lib.healthy ? ' healthy' : ' unhealthy'}`} />
                      <span className="status-label">
                        {lib.isRefreshing ? 'Scanning…' : lib.healthy ? 'Healthy' : 'Unreachable'}
                      </span>
                    </div>
                    <div className="lib-card-actions">
                      <button
                        className="lib-action-btn"
                        onClick={() => handleRescanLibrary(lib.id)}
                        disabled={rescanningLibId === lib.id || lib.isRefreshing}
                        title="Rescan library"
                      >
                        <svg className={lib.isRefreshing || rescanningLibId === lib.id ? 'spinning' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                      </button>
                      {confirmDeleteLibId === lib.id ? (
                        <span className="confirm-delete">
                          <span className="confirm-delete-label">Delete?</span>
                          <button className="btn-confirm-yes" onClick={() => handleDeleteLibrary(lib.id)} disabled={deletingLibId === lib.id}>
                            {deletingLibId === lib.id ? '…' : 'Yes'}
                          </button>
                          <button className="btn-confirm-no" onClick={() => setConfirmDeleteLibId(null)}>No</button>
                        </span>
                      ) : (
                        <button
                          className="lib-action-btn lib-action-delete"
                          onClick={() => setConfirmDeleteLibId(lib.id)}
                          title="Delete library"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ ADD LIBRARY MODAL ═══════════ */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={closeAddModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Library</h2>
              <button className="modal-close" onClick={closeAddModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="modal-body">
              {/* Name */}
              <div className="form-group">
                <label className="form-label">Library Name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. My Movies"
                  value={libName}
                  onChange={e => setLibName(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Content Type */}
              <div className="form-group">
                <label className="form-label">Content Type</label>
                <div className="toggle-group">
                  <button className={`toggle-btn${libKind === 0 ? ' active' : ''}`} onClick={() => setLibKind(0)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></svg>
                    Movies
                  </button>
                  <button className={`toggle-btn${libKind === 1 ? ' active' : ''}`} onClick={() => setLibKind(1)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>
                    Series
                  </button>
                </div>
              </div>

              {/* Source */}
              <div className="form-group">
                <label className="form-label">Source</label>
                <div className="toggle-group">
                  <button className={`toggle-btn${libBackend === 0 ? ' active' : ''}`} onClick={() => setLibBackend(0)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                    Local Filesystem
                  </button>
                  <button className={`toggle-btn${libBackend === 1 ? ' active' : ''}`} onClick={() => setLibBackend(1)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
                    Rclone Remote
                  </button>
                </div>
              </div>

              {/* Rclone Remote Selector */}
              {libBackend === 1 && (
                <div className="form-group form-group-animated">
                  <label className="form-label">Remote</label>
                  {remotesLoading ? (
                    <div className="form-loading"><div className="spinner-small" /> Loading remotes…</div>
                  ) : remotes.length === 0 && remotesLoaded ? (
                    <div className="form-hint">No rclone remotes found. Make sure rclone is configured on the server.</div>
                  ) : (
                    <select
                      className="form-select"
                      value={libRcloneName}
                      onChange={e => {
                        setLibRcloneName(e.target.value);
                        setShowBrowser(false);
                        setLibPath('');
                      }}
                    >
                      <option value="">Select a remote…</option>
                      {remotes.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Path */}
              <div className="form-group">
                <label className="form-label">Path</label>
                <div className="path-input-row">
                  <input
                    className="form-input"
                    type="text"
                    placeholder={libBackend === 0 ? '/path/to/media' : '/path/within/remote'}
                    value={libPath}
                    onChange={e => setLibPath(e.target.value)}
                  />
                  <button
                    className="btn-browse"
                    onClick={() => showBrowser ? setShowBrowser(false) : openBrowser()}
                    disabled={libBackend === 1 && !libRcloneName}
                    title="Browse folders on server"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    Browse
                  </button>
                </div>
              </div>

              {/* Folder Browser */}
              {showBrowser && (
                <div className="folder-browser">
                  <div className="browser-breadcrumb">
                    {getBreadcrumbs().map((crumb, i) => (
                      <span key={crumb.locator}>
                        {i > 0 && <span className="breadcrumb-sep">/</span>}
                        <button
                          className="breadcrumb-btn"
                          onClick={() => navigateToBreadcrumb(crumb.locator)}
                        >
                          {crumb.label}
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="browser-list">
                    {browserLoading ? (
                      <div className="browser-loading"><div className="spinner-small" /></div>
                    ) : browserError ? (
                      <div className="browser-error">{browserError}</div>
                    ) : browserFolders.length === 0 ? (
                      <div className="browser-empty">No subfolders found</div>
                    ) : (
                      browserFolders.map(folder => (
                        <button key={folder} className="browser-folder" onClick={() => navigateToFolder(folder)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                          <span className="browser-folder-name">{folder}</span>
                          <svg className="browser-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      ))
                    )}
                  </div>

                  <button className="btn-select-folder" onClick={selectCurrentFolder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Use This Folder
                  </button>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeAddModal}>Cancel</button>
              <button
                className="btn-create"
                onClick={handleCreateLibrary}
                disabled={creatingLib || !libName.trim() || !libPath.trim() || (libBackend === 1 && !libRcloneName)}
              >
                {creatingLib ? 'Creating…' : 'Create Library'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
