import { useEffect, useState, useCallback, useMemo } from 'react';
import './UnmatchedMedia.css';
import Modal from './Modal';
import {
  LockIcon, ErrorCircleIcon, FilmSimpleIcon, TvIcon,
  CheckIcon, SearchIcon, FileIcon, CloseIcon, ImageIcon,
} from './Icons';

/* ─── Types ─── */
interface Library {
  id: number;
  name: string;
}

interface MovieFile {
  fileName: string;
  filePath: string;
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  library: Library;
}

interface EpisodeFile {
  fileName: string;
  filePath: string;
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  library: Library;
}

interface TmdbMovieResult {
  title: string;
  releaseYear: number | null;
  overview: string;
  tmdbID: number;
  backdropPath: string;
  posterPath: string;
}

interface TmdbSeriesResult {
  name: string;
  firstAirYear: number | null;
  tmdbID: number;
  backdropPath: string;
  posterPath: string;
}

type Tab = 'movies' | 'episodes';

/* ─── GraphQL ─── */
const UNIDENTIFIED_MOVIE_FILES = `query ($offset: Int, $limit: Int) {
  unidentifiedMovieFiles(offset: $offset, limit: $limit) {
    fileName filePath uuid totalDuration fileSize
    library { id name }
  }
}`;

const UNIDENTIFIED_EPISODE_FILES = `query ($offset: Int, $limit: Int) {
  unidentifiedEpisodeFiles(offset: $offset, limit: $limit) {
    fileName filePath uuid totalDuration fileSize
    library { id name }
  }
}`;

const TMDB_SEARCH_MOVIES = `query ($query: String!) {
  tmdbSearchMovies(query: $query) {
    title releaseYear overview tmdbID backdropPath posterPath
  }
}`;

const TMDB_SEARCH_SERIES = `query ($query: String!) {
  tmdbSearchSeries(query: $query) {
    name firstAirYear tmdbID backdropPath posterPath
  }
}`;

const UPDATE_MOVIE_FILE = `mutation ($input: UpdateMovieFileMetadataInput!) {
  updateMovieFileMetadata(input: $input) {
    error { message hasError }
  }
}`;

const UPDATE_EPISODE_FILE = `mutation ($input: UpdateEpisodeFileMetadataInput!) {
  updateEpisodeFileMetadata(input: $input) {
    error { message hasError }
  }
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

function tmdbImg(path: string, size = 'w300'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function formatBytes(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (isNaN(n) || n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ─── Component ─── */
export default function UnmatchedMedia() {
  const [tab, setTab] = useState<Tab>('movies');
  const [movieFiles, setMovieFiles] = useState<MovieFile[]>([]);
  const [episodeFiles, setEpisodeFiles] = useState<EpisodeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Match panel state
  const [matchTarget, setMatchTarget] = useState<{ type: Tab; file: MovieFile | EpisodeFile; files?: EpisodeFile[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tmdbIdInput, setTmdbIdInput] = useState('');
  const [movieResults, setMovieResults] = useState<TmdbMovieResult[]>([]);
  const [seriesResults, setSeriesResults] = useState<TmdbSeriesResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchSuccess, setMatchSuccess] = useState('');

  // Multi-select for episodes
  const [selectedEpisodeUUIDs, setSelectedEpisodeUUIDs] = useState<Set<string>>(new Set());

  const isAdmin = useMemo(() => {
    const jwt = sessionStorage.getItem('jwt');
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [movieData, episodeData] = await Promise.all([
        gqlFetch<{ unidentifiedMovieFiles: MovieFile[] }>(UNIDENTIFIED_MOVIE_FILES, { offset: 0, limit: 200 }),
        gqlFetch<{ unidentifiedEpisodeFiles: EpisodeFile[] }>(UNIDENTIFIED_EPISODE_FILES, { offset: 0, limit: 200 }),
      ]);
      setMovieFiles(movieData.unidentifiedMovieFiles ?? []);
      setEpisodeFiles(episodeData.unidentifiedEpisodeFiles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unmatched files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // TMDB search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || !matchTarget) {
      setMovieResults([]);
      setSeriesResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        if (matchTarget.type === 'movies') {
          const data = await gqlFetch<{ tmdbSearchMovies: TmdbMovieResult[] }>(
            TMDB_SEARCH_MOVIES,
            { query: searchQuery.trim() },
          );
          setMovieResults(data.tmdbSearchMovies ?? []);
        } else {
          const data = await gqlFetch<{ tmdbSearchSeries: TmdbSeriesResult[] }>(
            TMDB_SEARCH_SERIES,
            { query: searchQuery.trim() },
          );
          setSeriesResults(data.tmdbSearchSeries ?? []);
        }
      } catch {
        setMovieResults([]);
        setSeriesResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery, matchTarget]);

  function openMatchPanel(type: Tab, file: MovieFile | EpisodeFile) {
    setMatchTarget({ type, file });
    setSearchQuery('');
    setTmdbIdInput('');
    setMovieResults([]);
    setSeriesResults([]);
    setMatchError('');
    setMatchSuccess('');
    // Pre-fill search with a cleaned up filename
    const name = file.fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[._]/g, ' ')
      .replace(/\s*\(?\d{4}\)?\s*$/, '')
      .trim();
    setSearchQuery(name);
  }

  function openMatchPanelForSelected() {
    const selected = episodeFiles.filter(f => selectedEpisodeUUIDs.has(f.uuid));
    if (selected.length === 0) return;
    setMatchTarget({ type: 'episodes', file: selected[0], files: selected });
    setSearchQuery('');
    setTmdbIdInput('');
    setMovieResults([]);
    setSeriesResults([]);
    setMatchError('');
    setMatchSuccess('');
    const name = selected[0].fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[._]/g, ' ')
      .replace(/\s*\(?\d{4}\)?\s*$/, '')
      .replace(/[Ss]\d+[Ee]\d+.*$/, '')
      .replace(/\d+x\d+.*$/, '')
      .trim();
    setSearchQuery(name);
  }

  function closeMatchPanel() {
    setMatchTarget(null);
    setSearchQuery('');
    setTmdbIdInput('');
    setMovieResults([]);
    setSeriesResults([]);
    setMatchError('');
    setMatchSuccess('');
    setSelectedEpisodeUUIDs(new Set());
  }

  async function doMatch(tmdbID: number) {
    if (!matchTarget) return;
    setMatching(true);
    setMatchError('');
    setMatchSuccess('');
    try {
      if (matchTarget.type === 'movies') {
        const data = await gqlFetch<{
          updateMovieFileMetadata: { error: { message: string; hasError: boolean } | null };
        }>(UPDATE_MOVIE_FILE, {
          input: { movieFileUUID: matchTarget.file.uuid, tmdbID },
        });
        if (data.updateMovieFileMetadata.error?.hasError) {
          setMatchError(data.updateMovieFileMetadata.error.message);
          return;
        }
      } else {
        const uuids = matchTarget.files
          ? matchTarget.files.map(f => f.uuid)
          : [matchTarget.file.uuid];
        const data = await gqlFetch<{
          updateEpisodeFileMetadata: { error: { message: string; hasError: boolean } | null };
        }>(UPDATE_EPISODE_FILE, {
          input: { episodeFileUUID: uuids, tmdbID },
        });
        if (data.updateEpisodeFileMetadata.error?.hasError) {
          setMatchError(data.updateEpisodeFileMetadata.error.message);
          return;
        }
      }
      setMatchSuccess('Matched successfully!');
      // Remove matched file(s) from list
      if (matchTarget.type === 'movies') {
        setMovieFiles(prev => prev.filter(f => f.uuid !== matchTarget.file.uuid));
      } else {
        const matchedUUIDs = matchTarget.files
          ? new Set(matchTarget.files.map(f => f.uuid))
          : new Set([matchTarget.file.uuid]);
        setEpisodeFiles(prev => prev.filter(f => !matchedUUIDs.has(f.uuid)));
        setSelectedEpisodeUUIDs(new Set());
      }
      setTimeout(closeMatchPanel, 800);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Failed to match file');
    } finally {
      setMatching(false);
    }
  }

  function handleTmdbIdSubmit() {
    const id = parseInt(tmdbIdInput.trim(), 10);
    if (isNaN(id) || id <= 0) {
      setMatchError('Please enter a valid TMDB ID');
      return;
    }
    doMatch(id);
  }

  if (!isAdmin) {
    return (
      <div className="access-denied">
        <LockIcon strokeWidth={1.5} />
        <h2>Access Denied</h2>
        <p>You need administrator privileges to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  const currentFiles = tab === 'movies' ? movieFiles : episodeFiles;

  return (
    <div className="unmatched-page">
      <div className="admin-header">
        <h1>Unmatched Media</h1>
        <p>Files that couldn&rsquo;t be automatically matched to a movie or series</p>
      </div>

      {error && (
        <div className="admin-error">
          <ErrorCircleIcon />
          {error}
        </div>
      )}

      {/* ─── TABS ─── */}
      <div className="um-tabs">
        <button
          className={`um-tab${tab === 'movies' ? ' active' : ''}`}
          onClick={() => setTab('movies')}
        >
          <FilmSimpleIcon />
          Movie Files
          {movieFiles.length > 0 && <span className="um-tab-count">{movieFiles.length}</span>}
        </button>
        <button
          className={`um-tab${tab === 'episodes' ? ' active' : ''}`}
          onClick={() => setTab('episodes')}
        >
          <TvIcon />
          Episode Files
          {episodeFiles.length > 0 && <span className="um-tab-count">{episodeFiles.length}</span>}
        </button>
      </div>

      {/* ─── FILE LIST ─── */}
      {currentFiles.length === 0 ? (
        <div className="admin-empty" style={{ marginTop: 24 }}>
          <CheckIcon strokeWidth={1.5} />
          <p>No unmatched {tab === 'movies' ? 'movie' : 'episode'} files</p>
          <span>All files have been identified</span>
        </div>
      ) : (
        <>
          {/* ─── Episode multi-select toolbar ─── */}
          {tab === 'episodes' && (
            <div className="um-select-bar">
              <label className="um-select-all">
                <input
                  type="checkbox"
                  checked={selectedEpisodeUUIDs.size === episodeFiles.length && episodeFiles.length > 0}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedEpisodeUUIDs(new Set(episodeFiles.map(f => f.uuid)));
                    } else {
                      setSelectedEpisodeUUIDs(new Set());
                    }
                  }}
                />
                <span>Select all ({episodeFiles.length})</span>
              </label>
              {selectedEpisodeUUIDs.size > 0 && (
                <button className="um-match-btn" onClick={openMatchPanelForSelected}>
                  <SearchIcon />
                  Match {selectedEpisodeUUIDs.size} selected
                </button>
              )}
            </div>
          )}
          <div className="um-file-list">
            {currentFiles.map(file => (
              <div className={`um-file-card${tab === 'episodes' && selectedEpisodeUUIDs.has(file.uuid) ? ' selected' : ''}`} key={file.uuid}>
                {tab === 'episodes' && (
                  <label className="um-checkbox" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedEpisodeUUIDs.has(file.uuid)}
                      onChange={e => {
                        setSelectedEpisodeUUIDs(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(file.uuid);
                          else next.delete(file.uuid);
                          return next;
                        });
                      }}
                    />
                  </label>
                )}
                <div className="um-file-icon">
                <FileIcon strokeWidth={1.5} />
              </div>
              <div className="um-file-info">
                <div className="um-file-name">{file.fileName}</div>
                <div className="um-file-meta">
                  <span className="um-file-path" title={file.filePath}>{file.filePath}</span>
                </div>
                <div className="um-file-details">
                  <span>{formatBytes(file.fileSize)}</span>
                  <span className="um-file-dot">·</span>
                  <span>{formatDuration(file.totalDuration)}</span>
                  <span className="um-file-dot">·</span>
                  <span className="um-file-library">{file.library.name}</span>
                </div>
              </div>
              <button className="um-match-btn" onClick={() => openMatchPanel(tab, file)}>
                <SearchIcon />
                Match
              </button>
            </div>
          ))}
          </div>
        </>
      )}

      {/* ─── MATCH PANEL OVERLAY ─── */}
      <Modal open={!!matchTarget} onClose={closeMatchPanel} className="um-panel">
        {matchTarget && (<>
            <div className="um-panel-header">
              <div>
                <h2>{matchTarget.files && matchTarget.files.length > 1
                  ? `Match ${matchTarget.files.length} Files`
                  : 'Match File'}</h2>
                {matchTarget.files && matchTarget.files.length > 1 ? (
                  <p className="um-panel-filename">{matchTarget.files.length} episode files selected</p>
                ) : (
                  <p className="um-panel-filename">{matchTarget.file.fileName}</p>
                )}
              </div>
              <button className="um-panel-close" onClick={closeMatchPanel}>
                <CloseIcon />
              </button>
            </div>

            {matchError && (
              <div className="admin-error" style={{ margin: '0 0 16px' }}>
                <ErrorCircleIcon />
                {matchError}
              </div>
            )}

            {matchSuccess && (
              <div className="um-success">
                <CheckIcon />
                {matchSuccess}
              </div>
            )}

            {/* ─── TMDB ID Input ─── */}
            <div className="um-id-section">
              <label className="um-label">TMDB ID</label>
              <div className="um-id-row">
                <input
                  type="text"
                  className="um-input"
                  placeholder={`Enter ${matchTarget.type === 'movies' ? 'movie' : 'series'} TMDB ID…`}
                  value={tmdbIdInput}
                  onChange={e => setTmdbIdInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTmdbIdSubmit()}
                />
                <button
                  className="um-id-submit"
                  onClick={handleTmdbIdSubmit}
                  disabled={matching || !tmdbIdInput.trim()}
                >
                  {matching ? 'Matching…' : 'Apply'}
                </button>
              </div>
            </div>

            {/* ─── TMDB Search ─── */}
            <div className="um-search-section">
              <label className="um-label">Search TMDB</label>
              <div className="um-search-input-wrap">
                <SearchIcon />
                <input
                  type="text"
                  className="um-search-input"
                  placeholder={`Search for a ${matchTarget.type === 'movies' ? 'movie' : 'series'}…`}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searching && <div className="um-search-spinner" />}
              </div>
            </div>

            {/* ─── Search Results ─── */}
            <div className="um-results">
              {matchTarget.type === 'movies' && movieResults.length > 0 && (
                movieResults.map(r => (
                  <button
                    className="um-result-card"
                    key={r.tmdbID}
                    onClick={() => doMatch(r.tmdbID)}
                    disabled={matching}
                  >
                    <div className="um-result-poster">
                      {r.posterPath ? (
                        <img src={tmdbImg(r.posterPath)} alt={r.title} onLoad={e => e.currentTarget.classList.add('loaded')} />
                      ) : (
                        <div className="um-no-poster">
                          <ImageIcon strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="um-result-info">
                      <div className="um-result-title">{r.title}</div>
                      <div className="um-result-year">{r.releaseYear ?? 'Unknown year'}</div>
                      <div className="um-result-id">TMDB: {r.tmdbID}</div>
                      {r.overview && <div className="um-result-overview">{r.overview}</div>}
                    </div>
                  </button>
                ))
              )}

              {matchTarget.type === 'episodes' && seriesResults.length > 0 && (
                seriesResults.map(r => (
                  <button
                    className="um-result-card"
                    key={r.tmdbID}
                    onClick={() => doMatch(r.tmdbID)}
                    disabled={matching}
                  >
                    <div className="um-result-poster">
                      {r.posterPath ? (
                        <img src={tmdbImg(r.posterPath)} alt={r.name} onLoad={e => e.currentTarget.classList.add('loaded')} />
                      ) : (
                        <div className="um-no-poster">
                          <ImageIcon strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="um-result-info">
                      <div className="um-result-title">{r.name}</div>
                      <div className="um-result-year">{r.firstAirYear ?? 'Unknown year'}</div>
                      <div className="um-result-id">TMDB: {r.tmdbID}</div>
                    </div>
                  </button>
                ))
              )}

              {!searching && searchQuery.trim() &&
                ((matchTarget.type === 'movies' && movieResults.length === 0) ||
                 (matchTarget.type === 'episodes' && seriesResults.length === 0)) && (
                <div className="um-no-results">
                  <SearchIcon strokeWidth={1.5} />
                  <p>No results found</p>
                  <span>Try a different search term or enter the TMDB ID directly</span>
                </div>
              )}
            </div>
        </>)}
      </Modal>
    </div>
  );
}
