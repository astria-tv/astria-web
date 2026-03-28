import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJwt, parseJwt, handleAuthFailure } from './auth';
import './Dashboard.css';
import PosterCard from './PosterCard';
import Modal from './Modal';
import {
  MediaPlayIcon, FilmSimpleIcon, TvIcon, PlayIcon, PlayOutlineIcon,
  FolderPlusIcon, RefreshCwIcon, SettingsIcon, ClockIcon, BookmarkIcon,
} from './Icons';

/* ─── Types ─── */
interface PlayState {
  finished: boolean;
  playtime: number;
}

interface StreamInfo {
  codecName: string | null;
  bitRate: number | null;
  streamType: string | null;
  resolution: string | null;
}

interface MovieFile {
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: StreamInfo[];
}

interface Movie {
  __typename: 'Movie';
  title: string;
  original_title: string;
  year: string;
  overview: string;
  posterURL: string;
  backdropPath: string;
  uuid: string;
  playState: PlayState | null;
  files: MovieFile[];
  onWatchlist: boolean;
}

interface Season {
  name: string;
  seasonNumber: number;
  posterPath: string;
  series: { name: string; uuid: string; posterPath: string } | null;
}

interface EpisodeFile {
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: StreamInfo[];
}

interface Episode {
  __typename: 'Episode';
  name: string;
  overview: string;
  stillPath: string;
  episodeNumber: number;
  uuid: string;
  playState: PlayState | null;
  season: Season | null;
  files: EpisodeFile[];
}

type MediaItem = Movie | Episode;

interface Series {
  __typename: 'Series';
  name: string;
  overview: string;
  posterPath: string;
  backdropPath: string;
  uuid: string;
  firstAirDate: string;
  unwatchedEpisodesCount: number;
  onWatchlist: boolean;
}

interface MediaStats {
  movieCount: number;
  seriesCount: number;
  seasonCount: number;
  episodeCount: number;
}

interface WatchlistMovie {
  __typename: 'Movie';
  title: string;
  year: string;
  posterURL: string;
  uuid: string;
  playState: PlayState | null;
  files: MovieFile[];
}

interface WatchlistSeries {
  __typename: 'Series';
  name: string;
  posterPath: string;
  uuid: string;
  firstAirDate: string;
  unwatchedEpisodesCount: number;
}

type WatchlistItem = WatchlistMovie | WatchlistSeries;

/* ─── GraphQL Queries ─── */
const DASHBOARD_QUERY = `{
  movies(limit: 20, sort: title) {
    title
    original_title
    year
    overview
    posterURL(width: 300)
    backdropPath
    uuid
    onWatchlist
    playState { finished playtime }
    files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
  }
  series(limit: 20, sort: name) {
    name
    overview
    posterPath
    backdropPath
    uuid
    firstAirDate
    unwatchedEpisodesCount
    onWatchlist
  }
  recentlyAdded {
    __typename
    ... on Movie {
      title
      year
      posterURL(width: 300)
      uuid
      onWatchlist
      playState { finished playtime }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
    }
    ... on Episode {
      name
      episodeNumber
      stillPath
      uuid
      playState { finished playtime }
      season { seasonNumber posterPath series { name uuid posterPath } }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
    }
  }
  upNext {
    __typename
    ... on Movie {
      title
      year
      overview
      posterURL(width: 300)
      backdropPath
      uuid
      playState { finished playtime }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
    }
    ... on Episode {
      name
      episodeNumber
      stillPath
      uuid
      playState { finished playtime }
      season { seasonNumber series { name uuid } }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
    }
  }
  mediaStats {
    movieCount
    seriesCount
    seasonCount
    episodeCount
  }
  watchlist {
    __typename
    ... on Movie {
      title
      year
      posterURL(width: 300)
      uuid
      playState { finished playtime }
      files { uuid totalDuration fileSize streams { codecName bitRate streamType resolution } }
    }
    ... on Series {
      name
      posterPath
      uuid
      firstAirDate
      unwatchedEpisodesCount
    }
  }
}`;


const SERIES_FIRST_EPISODE_QUERY = `query SeriesFirstEp($uuid: String!) {
  series(uuid: $uuid) {
    name
    seasons {
      seasonNumber
      name
      episodes {
        name
        episodeNumber
        uuid
        playState { finished playtime }
        files {
          uuid
          totalDuration
          fileSize
          streams { codecName bitRate streamType resolution }
        }
      }
    }
  }
}`;

/* ─── Helpers ─── */
interface FilePickerOption {
  uuid: string;
  resolution: string;
  codec: string;
  bitrate: string;
  size: string;
}

interface FilePickerState {
  title: string;
  subtitle: string;
  mediaUuid: string;
  startTime: number;
  episodeUuid?: string;
  options: FilePickerOption[];
}

function formatFileSize(bytesStr: string): string {
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes === 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function buildFileOptions(files: { uuid: string; fileSize: string; streams: StreamInfo[] }[]): FilePickerOption[] {
  return [...files]
    .sort((a, b) => {
      const resA = parseInt(a.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
      const resB = parseInt(b.streams?.find(s => s.streamType === 'video')?.resolution ?? '') || 0;
      return resB - resA;
    })
    .map(f => {
      const vs = f.streams?.find(s => s.streamType === 'video');
      return {
        uuid: f.uuid,
        resolution: vs?.resolution ?? 'Unknown',
        codec: vs?.codecName?.toUpperCase() ?? '',
        bitrate: vs?.bitRate ? `${Math.round(vs.bitRate / 1000)}k` : '',
        size: formatFileSize(f.fileSize),
      };
    });
}
function tmdbImg(path: string, size = 'w500'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function progressPercent(item: MediaItem): number {
  if (!item.playState || item.playState.finished) return 0;
  const duration =
    item.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return 0;
  return Math.min(100, Math.round((item.playState.playtime / duration) * 100));
}

function cwLabel(item: MediaItem): string {
  if (item.__typename === 'Episode') {
    const ep = item as Episode;
    const seriesName = ep.season?.series?.name ?? '';
    const s = ep.season?.seasonNumber ?? 0;
    const e = ep.episodeNumber;
    return `${seriesName} · S${s} E${e}`;
  }
  return (item as Movie).title;
}

function cwSub(item: MediaItem): string {
  if (!item.playState || item.playState.finished) return '';
  const duration = item.files?.[0]?.totalDuration ?? 0;
  if (duration <= 0) return '';
  const remaining = duration - item.playState.playtime;
  return `${formatDuration(remaining)} left`;
}

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

/* ─── Component ─── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [upNext, setUpNext] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroItem, setHeroItem] = useState<Movie | Series | null>(null);
  const [filePicker, setFilePicker] = useState<FilePickerState | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  const isAdmin = (() => {
    const jwt = getJwt();
    if (!jwt) return false;
    const payload = parseJwt(jwt);
    return payload?.admin === true;
  })();

  const isEmpty = !loading && movies.length === 0 && series.length === 0 && recentlyAdded.length === 0;


  const fetchData = useCallback(async () => {
    try {
      const data = await gqlFetch<{
        movies: Movie[];
        series: Series[];
        recentlyAdded: MediaItem[];
        upNext: MediaItem[];
        mediaStats: MediaStats;
        watchlist: WatchlistItem[];
      }>(DASHBOARD_QUERY);

      setMovies(data.movies);
      setSeries(data.series);
      setRecentlyAdded(data.recentlyAdded ?? []);
      setUpNext(data.upNext ?? []);
      setStats(data.mediaStats);
      setWatchlist(data.watchlist ?? []);

      // Pick a random movie or series with a backdrop for the hero
      const moviesWithBackdrop = data.movies.filter(m => m.backdropPath);
      const seriesWithBackdrop = data.series.filter(s => s.backdropPath);
      const allWithBackdrop: (Movie | Series)[] = [
        ...moviesWithBackdrop.map(m => ({ ...m, __typename: 'Movie' as const })),
        ...seriesWithBackdrop.map(s => ({ ...s, __typename: 'Series' as const })),
      ];
      if (allWithBackdrop.length > 0) {
        setHeroItem(allWithBackdrop[Math.floor(Math.random() * allWithBackdrop.length)]);
      } else if (data.movies.length > 0) {
        setHeroItem({ ...data.movies[0], __typename: 'Movie' as const });
      } else if (data.series.length > 0) {
        setHeroItem({ ...data.series[0], __typename: 'Series' as const });
      }
    } catch {
      // silently fail — sections will just be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function playFile(fileUuid: string, title: string, subtitle: string, mediaUuid: string, startTime: number, episodeUuid?: string) {
    navigate(`/play/${fileUuid}`, {
      state: { title, subtitle, mediaUuid, startTime, episodeUuid },
    });
  }

  function handleEpisodePlay(episode: Episode) {
    if (!episode.files || episode.files.length === 0) return;
    const startTime = episode.playState?.finished ? 0 : (episode.playState?.playtime ?? 0);
    const seriesName = episode.season?.series?.name ?? '';
    const s = episode.season?.seasonNumber ?? 0;
    const e = episode.episodeNumber;
    const subtitle = `${seriesName} · S${s} E${e}`;

    if (episode.files.length === 1) {
      playFile(episode.files[0].uuid, episode.name, subtitle, episode.uuid, startTime, episode.uuid);
    } else {
      setFilePicker({
        title: episode.name,
        subtitle,
        mediaUuid: episode.uuid,
        startTime,
        episodeUuid: episode.uuid,
        options: buildFileOptions(episode.files),
      });
    }
  }

  function handleMediaItemPlay(item: MediaItem, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (item.__typename === 'Movie') {
      handleMoviePlay(item as Movie);
    } else if (item.__typename === 'Episode') {
      handleEpisodePlay(item as Episode);
    }
  }

  function handleMoviePlay(movie: Movie) {
    if (!movie.files || movie.files.length === 0) return;
    const startTime = movie.playState?.finished ? 0 : (movie.playState?.playtime ?? 0);
    const duration = movie.files[0]?.totalDuration;
    const subtitle = [movie.year, duration ? formatDuration(duration) : null].filter(Boolean).join(' · ');

    if (movie.files.length === 1) {
      playFile(movie.files[0].uuid, movie.title, subtitle, movie.uuid, startTime);
    } else {
      setFilePicker({
        title: movie.title,
        subtitle,
        mediaUuid: movie.uuid,
        startTime,
        options: buildFileOptions(movie.files),
      });
    }
  }

  async function handleSeriesPlay(s: Series) {
    setHeroLoading(true);
    try {
      const data = await gqlFetch<{
        series: Array<{
          name: string;
          seasons: Array<{
            seasonNumber: number;
            name: string;
            episodes: Array<{
              name: string;
              episodeNumber: number;
              uuid: string;
              playState: PlayState | null;
              files: Array<{ uuid: string; totalDuration: number | null; fileSize: string; streams: StreamInfo[] }>;
            }>;
          }>;
        }>;
      }>(SERIES_FIRST_EPISODE_QUERY, { uuid: s.uuid });

      const seriesData = data.series[0];
      if (!seriesData) return;

      // Find the first season (sorted) with episodes that have files
      const sortedSeasons = [...seriesData.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
      let targetEp: typeof sortedSeasons[0]['episodes'][0] | null = null;
      let targetSeason: typeof sortedSeasons[0] | null = null;

      for (const season of sortedSeasons) {
        const sortedEps = [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
        const ep = sortedEps.find(e => e.files.length > 0);
        if (ep) {
          targetEp = ep;
          targetSeason = season;
          break;
        }
      }

      if (!targetEp || !targetSeason) return;

      const startTime = targetEp.playState?.finished ? 0 : (targetEp.playState?.playtime ?? 0);
      const subtitle = `${seriesData.name} · ${targetSeason.name} · E${targetEp.episodeNumber}`;

      if (targetEp.files.length === 1) {
        playFile(targetEp.files[0].uuid, targetEp.name, subtitle, targetEp.uuid, startTime);
      } else {
        setFilePicker({
          title: targetEp.name,
          subtitle,
          mediaUuid: targetEp.uuid,
          startTime,
          options: buildFileOptions(targetEp.files),
        });
      }
    } catch {
      // silently fail
    } finally {
      setHeroLoading(false);
    }
  }

  function handleHeroPlay() {
    if (!heroItem) return;
    if (heroItem.__typename === 'Movie') {
      handleMoviePlay(heroItem as Movie);
    } else {
      handleSeriesPlay(heroItem as Series);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <>
        {/* Empty State Hero */}
        <section className="empty-hero">
          <div className="empty-hero-bg">
            <div className="empty-hero-orb orb-1" />
            <div className="empty-hero-orb orb-2" />
            <div className="empty-hero-orb orb-3" />
          </div>
          <div className="empty-hero-content">
            <div className="empty-hero-icon">
              <MediaPlayIcon />
            </div>
            <h1 className="empty-hero-title">Welcome to Astria</h1>
            <p className="empty-hero-subtitle">
              Your media server is ready. {isAdmin ? 'Let\'s get your library set up.' : 'Media will appear here once your admin adds some content.'}
            </p>
          </div>
        </section>

        {/* Stats Strip — zeros shown contextually */}
        {stats && (
          <div className="activity-strip">
            <div className="activity-card">
              <div className="activity-icon green">
                <FilmSimpleIcon />
              </div>
              <div className="activity-text">
                <h4>{stats.movieCount.toLocaleString()}</h4>
                <p>Movies</p>
              </div>
            </div>
            <div className="activity-card">
              <div className="activity-icon blue">
                <TvIcon />
              </div>
              <div className="activity-text">
                <h4>{stats.seriesCount.toLocaleString()}</h4>
                <p>TV Series</p>
              </div>
            </div>
            <div className="activity-card">
              <div className="activity-icon amber">
                <PlayOutlineIcon />
              </div>
              <div className="activity-text">
                <h4>{stats.episodeCount.toLocaleString()}</h4>
                <p>Episodes</p>
              </div>
            </div>
          </div>
        )}

        {/* Getting Started Steps (admin only) */}
        {isAdmin && (
          <section className="section empty-steps-section">
            <div className="section-header">
              <h2 className="section-title">Getting Started</h2>
            </div>
            <div className="empty-steps">
              <div className="empty-step-card">
                <div className="empty-step-number">1</div>
                <div className="empty-step-icon">
                  <FolderPlusIcon />
                </div>
                <h3>Add Media Folders</h3>
                <p>Point Astria to directories containing your movies and TV shows.</p>
              </div>
              <div className="empty-step-card">
                <div className="empty-step-number">2</div>
                <div className="empty-step-icon">
                  <RefreshCwIcon />
                </div>
                <h3>Scan &amp; Match</h3>
                <p>Astria will scan your files and fetch metadata like posters and descriptions.</p>
              </div>
              <div className="empty-step-card">
                <div className="empty-step-number">3</div>
                <div className="empty-step-icon">
                  <PlayOutlineIcon />
                </div>
                <h3>Start Watching</h3>
                <p>Browse, search, and stream your entire library from any device.</p>
              </div>
            </div>
            <div className="empty-cta">
              <button className="btn btn-play" onClick={() => navigate('/admin?tab=libraries')}>
                <SettingsIcon style={{ width: 18, height: 18 }} />
                Open Admin Settings
              </button>
            </div>
          </section>
        )}

        {/* Non-admin empty state */}
        {!isAdmin && (
          <section className="section empty-waiting-section">
            <div className="empty-waiting-card">
              <div className="empty-waiting-icon">
                <ClockIcon strokeWidth={1.5} />
              </div>
              <h3>Content is on its way</h3>
              <p>Your admin is setting up the media library. Check back soon!</p>
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
        {/* Hero */}
        {heroItem && (() => {
          const isMovie = heroItem.__typename === 'Movie';
          const heroMovie = isMovie ? heroItem as Movie : null;
          const heroSeries = !isMovie ? heroItem as Series : null;
          const backdrop = isMovie ? heroMovie!.backdropPath : heroSeries!.backdropPath;
          const title = isMovie ? heroMovie!.title : heroSeries!.name;
          const year = isMovie ? heroMovie!.year : heroSeries!.firstAirDate?.substring(0, 4);
          const overview = isMovie ? heroMovie!.overview : heroSeries!.overview;
          const duration = isMovie ? heroMovie!.files?.[0]?.totalDuration : null;
          const detailPath = isMovie ? `/movie/${heroMovie!.uuid}` : `/series/${heroSeries!.uuid}`;

          return (
            <section className="hero">
              <div className="hero-bg">
                {backdrop && (
                  <img
                    className="hero-bg-img"
                    src={tmdbImg(backdrop, 'original')}
                    alt=""
                    onLoad={e => e.currentTarget.classList.add('loaded')}
                  />
                )}
                <div className="shimmer" />
              </div>
              <div className="hero-content">
                <div className="hero-badge">{isMovie ? 'Featured Film' : 'Featured Series'}</div>
                <h1 className="hero-title">{title}</h1>
                <div className="hero-meta">
                  {year && <span>{year}</span>}
                  {duration && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(duration)}</span>
                    </>
                  )}
                </div>
                <p className="hero-desc">{overview}</p>
                <div className="hero-actions">
                  <button className="btn btn-play" onClick={handleHeroPlay} disabled={heroLoading}>
                    <PlayIcon />
                    {heroLoading ? 'Loading…' : 'Play'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => navigate(detailPath)}>More Info</button>
                </div>
              </div>
            </section>
          );
        })()}

            {/* Continue Watching / Up Next */}
            {upNext.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title">Continue Watching</h2>
                </div>
                <div className="media-row">
                  {upNext.map(item => (
                    <div className="cw-card" key={item.uuid} onClick={() => {
                      if (item.__typename === 'Movie') {
                        navigate(`/movie/${item.uuid}`);
                      } else if (item.__typename === 'Episode') {
                        const ep = item as Episode;
                        const seriesUuid = ep.season?.series?.uuid;
                        if (seriesUuid) {
                          navigate(`/series/${seriesUuid}?season=${ep.season?.seasonNumber ?? 1}`);
                        }
                      }
                    }} style={{ cursor: 'pointer' }}>
                      <div className="cw-thumb">
                        {item.__typename === 'Movie' && (item as Movie).posterURL && (
                          <img src={(item as Movie).posterURL} alt="" className="cw-thumb-img" onLoad={e => e.currentTarget.classList.add('loaded')} />
                        )}
                        {item.__typename === 'Episode' && (item as Episode).stillPath && (
                          <img src={tmdbImg((item as Episode).stillPath)} alt="" className="cw-thumb-img" onLoad={e => e.currentTarget.classList.add('loaded')} />
                        )}
                        <div className="play-overlay" onClick={ev => handleMediaItemPlay(item, ev)}>
                          <PlayIcon />
                        </div>
                        <div className="cw-progress">
                          <div className="cw-progress-bar" style={{ width: `${progressPercent(item)}%` }} />
                        </div>
                      </div>
                      <div className="cw-info">
                        <h3>{cwLabel(item)}</h3>
                        <p>{cwSub(item)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* My Watchlist */}
            {watchlist.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title"><BookmarkIcon width={20} height={20} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />My Watchlist</h2>
                  <span className="section-link" onClick={() => navigate('/watchlist')} style={{ cursor: 'pointer' }}>See all →</span>
                </div>
                <div className="media-row">
                  {watchlist.map(item => {
                    if (item.__typename === 'Movie') {
                      const m = item as WatchlistMovie;
                      return (
                        <PosterCard
                          key={m.uuid}
                          posterUrl={m.posterURL}
                          title={m.title}
                          subtitle={m.year}
                          detailPath={`/movie/${m.uuid}`}
                          mediaType="movie"
                          files={m.files}
                          playState={m.playState}
                          mediaUuid={m.uuid}
                          watched={m.playState?.finished}
                          progress={(!m.playState?.finished && m.playState?.playtime && m.files?.[0]?.totalDuration)
                            ? m.playState.playtime / m.files[0].totalDuration
                            : undefined}
                        />
                      );
                    }
                    const s = item as WatchlistSeries;
                    return (
                      <PosterCard
                        key={s.uuid}
                        posterUrl={tmdbImg(s.posterPath)}
                        title={s.name}
                        subtitle={s.firstAirDate?.substring(0, 4)}
                        badge={s.unwatchedEpisodesCount > 0 ? `${s.unwatchedEpisodesCount} new` : undefined}
                        detailPath={`/series/${s.uuid}`}
                        mediaType="series"
                        mediaUuid={s.uuid}
                        watched={s.unwatchedEpisodesCount === 0}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recently Added */}
            {recentlyAdded.length > 0 && (
              <section className="section">
                <div className="section-header">
                  <h2 className="section-title">Recently Added</h2>
                </div>
                <div className="media-row">
                  {recentlyAdded.map(item => {
                    const isMovie = item.__typename === 'Movie';
                    const movie = item as Movie;
                    const episode = item as Episode;
                    return (
                      <PosterCard
                        key={item.uuid}
                        posterUrl={isMovie ? movie.posterURL : tmdbImg((episode.season?.posterPath || episode.season?.series?.posterPath) ?? '', 'w300')}
                        title={isMovie ? movie.title : (episode.season?.series?.name ?? '')}
                        subtitle={isMovie ? movie.year : `S${episode.season?.seasonNumber ?? '?'} E${episode.episodeNumber}`}
                        badge="New"
                        detailPath={isMovie ? `/movie/${movie.uuid}` : `/series/${episode.season?.series?.uuid}?season=${episode.season?.seasonNumber ?? 1}`}
                        mediaType={isMovie ? 'movie' : 'movie'}
                        files={item.files}
                        playState={item.playState}
                        mediaUuid={item.uuid}
                        watched={item.playState?.finished}
                        progress={(!item.playState?.finished && item.playState?.playtime && item.files?.[0]?.totalDuration)
                          ? item.playState.playtime / item.files[0].totalDuration
                          : undefined}
                        onWatchlist={isMovie ? (movie as Movie).onWatchlist : undefined}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {/* Stats Strip */}
            {stats && (
              <div className="activity-strip" style={{ paddingBottom: 60 }}>
                <div className="activity-card">
                  <div className="activity-icon green">
                    <FilmSimpleIcon />
                  </div>
                  <div className="activity-text">
                    <h4>{stats.movieCount.toLocaleString()}</h4>
                    <p>Movies</p>
                  </div>
                </div>
                <div className="activity-card">
                  <div className="activity-icon blue">
                    <TvIcon />
                  </div>
                  <div className="activity-text">
                    <h4>{stats.seriesCount.toLocaleString()}</h4>
                    <p>TV Series</p>
                  </div>
                </div>
                <div className="activity-card">
                  <div className="activity-icon amber">
                    <PlayOutlineIcon />
                  </div>
                  <div className="activity-text">
                    <h4>{stats.episodeCount.toLocaleString()}</h4>
                    <p>Episodes</p>
                  </div>
                </div>
              </div>
            )}

      {/* File Picker Modal */}
      <Modal open={!!filePicker} onClose={() => setFilePicker(null)} className="fp-modal">
          {filePicker && (<>
            <div className="fp-header">
              <span className="fp-label">Choose Version</span>
              <span className="fp-title">{filePicker.subtitle}</span>
            </div>
            {filePicker.options.map(opt => (
              <button
                key={opt.uuid}
                className="fp-option"
                onClick={() => {
                  playFile(opt.uuid, filePicker.title, filePicker.subtitle, filePicker.mediaUuid, filePicker.startTime, filePicker.episodeUuid);
                  setFilePicker(null);
                }}
              >
                <PlayIcon className="fp-play-icon" />
                <span className="fp-res">{opt.resolution}</span>
                <span className="fp-tags">
                  {opt.codec && <span className="fp-tag">{opt.codec}</span>}
                  {opt.bitrate && <span className="fp-tag">{opt.bitrate}</span>}
                </span>
                <span className="fp-size">{opt.size}</span>
              </button>
            ))}
          </>)}
      </Modal>
    </>
  );
}
