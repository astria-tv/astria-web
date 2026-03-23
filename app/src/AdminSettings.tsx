import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getJwt, parseJwt, handleAuthFailure } from './auth';
import './AdminSettings.css';
import Modal from './Modal';
import {
  LockIcon, UsersIcon, FolderIcon, ErrorCircleIcon, PlusIcon,
  CheckIcon, CopyIcon, UserPlusIcon, TrashIcon, CloseIcon,
  FilmIcon, TvIcon, FilmSimpleIcon, CloudIcon, SearchIcon,
  ChevronRightIcon, RefreshIcon,
} from './Icons';

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

function isCurrentUserAdmin(): boolean {
  const jwt = getJwt();
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

      const jwt = getJwt();
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
        <LockIcon />
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
          <UsersIcon />
          Users & Invites
        </button>
        <button
          className={`admin-tab${activeTab === 'libraries' ? ' active' : ''}`}
          onClick={() => setActiveTab('libraries')}
        >
          <FolderIcon />
          Libraries
        </button>
      </div>

      {error && (
        <div className="admin-error">
          <ErrorCircleIcon />
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
                <PlusIcon />
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
                      <CheckIcon />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon />
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
                  <UserPlusIcon />
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
                              <CheckIcon />
                            ) : (
                              <CopyIcon />
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
                  <UsersIcon strokeWidth={1.5} />
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
                                <TrashIcon />
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
              <PlusIcon />
              Add Library
            </button>
          </div>
          <p className="admin-section-desc">
            Configure where your media files are located. Each library contains either movies or series.
          </p>

          {libraries.length === 0 ? (
            <div className="admin-table-wrap">
              <div className="admin-empty">
                <FolderIcon strokeWidth={1.5} />
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
                        <FilmIcon strokeWidth={1.5} />
                      ) : (
                        <TvIcon strokeWidth={1.5} />
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
                        <RefreshIcon className={lib.isRefreshing || rescanningLibId === lib.id ? 'spinning' : ''} />
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
                          <TrashIcon />
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
      <Modal open={showAddModal} onClose={closeAddModal} className="admin-modal">
            <div className="modal-header">
              <h2>Add Library</h2>
              <button className="modal-close" onClick={closeAddModal}>
                <CloseIcon />
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
                    <FilmSimpleIcon strokeWidth={1.5} />
                    Movies
                  </button>
                  <button className={`toggle-btn${libKind === 1 ? ' active' : ''}`} onClick={() => setLibKind(1)}>
                    <TvIcon strokeWidth={1.5} />
                    Series
                  </button>
                </div>
              </div>

              {/* Source */}
              <div className="form-group">
                <label className="form-label">Source</label>
                <div className="toggle-group">
                  <button className={`toggle-btn${libBackend === 0 ? ' active' : ''}`} onClick={() => setLibBackend(0)}>
                    <FolderIcon strokeWidth={1.5} />
                    Local Filesystem
                  </button>
                  <button className={`toggle-btn${libBackend === 1 ? ' active' : ''}`} onClick={() => setLibBackend(1)}>
                    <CloudIcon strokeWidth={1.5} />
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
                    <SearchIcon />
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
                          <FolderIcon strokeWidth={1.5} />
                          <span className="browser-folder-name">{folder}</span>
                          <ChevronRightIcon className="browser-chevron" />
                        </button>
                      ))
                    )}
                  </div>

                  <button className="btn-select-folder" onClick={selectCurrentFolder}>
                    <CheckIcon />
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
      </Modal>
    </div>
  );
}
