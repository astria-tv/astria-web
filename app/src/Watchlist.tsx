import { useEffect, useState, useMemo } from 'react';
import './Watchlist.css';
import { getJwt, handleAuthFailure } from './auth';
import PosterCard from './PosterCard';
import { SearchIcon, BookmarkIcon } from './Icons';

/* ─── Types ─── */
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
  year: string;
  posterURL: string;
  uuid: string;
  playState: { finished: boolean; playtime: number } | null;
  files: MovieFile[];
}

interface Series {
  __typename: 'Series';
  name: string;
  posterPath: string;
  uuid: string;
  firstAirDate: string;
  unwatchedEpisodesCount: number;
}

type WatchlistItem = Movie | Series;

type FilterOption = 'all' | 'movies' | 'series';

/* ─── GraphQL ─── */
const WATCHLIST_QUERY = `{
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

async function gqlFetch<T>(query: string): Promise<T> {
  const jwt = getJwt();
  const res = await fetch('/olaris/m/query', {
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

function tmdbImg(path: string, size = 'w300'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/* ─── Component ─── */
export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterOption>('all');

  useEffect(() => {
    gqlFetch<{ watchlist: WatchlistItem[] }>(WATCHLIST_QUERY)
      .then(data => setItems(data.watchlist ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (typeFilter === 'movies') result = result.filter(i => i.__typename === 'Movie');
    if (typeFilter === 'series') result = result.filter(i => i.__typename === 'Series');
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(i => {
        const name = i.__typename === 'Movie' ? (i as Movie).title : (i as Series).name;
        return name.toLowerCase().includes(q);
      });
    }
    return result;
  }, [items, filter, typeFilter]);

  const movieCount = items.filter(i => i.__typename === 'Movie').length;
  const seriesCount = items.filter(i => i.__typename === 'Series').length;

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="movies-header">
        <h1>
          Watchlist{' '}
          <span className="movies-count">({items.length})</span>
        </h1>
      </div>

      {/* Filters bar */}
      <div className="movies-filters">
        <div className="watchlist-pills">
          <button
            className={`watchlist-pill${typeFilter === 'all' ? ' active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All ({items.length})
          </button>
          <button
            className={`watchlist-pill${typeFilter === 'movies' ? ' active' : ''}`}
            onClick={() => setTypeFilter('movies')}
          >
            Movies ({movieCount})
          </button>
          <button
            className={`watchlist-pill${typeFilter === 'series' ? ' active' : ''}`}
            onClick={() => setTypeFilter('series')}
          >
            Series ({seriesCount})
          </button>
        </div>
        <div className="movies-filter-input">
          <SearchIcon />
          <input
            type="text"
            placeholder="Filter by title…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="movies-empty">
          <BookmarkIcon strokeWidth={1.5} />
          {items.length === 0 ? (
            <>
              <h2>Your watchlist is empty</h2>
              <p>Browse movies and series, then add them to your watchlist to keep track of what you want to watch.</p>
            </>
          ) : (
            <>
              <h2>No matches</h2>
              <p>No watchlist items match your filter</p>
            </>
          )}
        </div>
      ) : (
        <div className="movies-grid">
          {filtered.map(item => {
            if (item.__typename === 'Movie') {
              const movie = item as Movie;
              return (
                <PosterCard
                  key={movie.uuid}
                  posterUrl={movie.posterURL}
                  title={movie.title}
                  subtitle={movie.year}
                  detailPath={`/movie/${movie.uuid}`}
                  mediaType="movie"
                  files={movie.files}
                  playState={movie.playState}
                  mediaUuid={movie.uuid}
                  watched={movie.playState?.finished}
                  progress={(!movie.playState?.finished && movie.playState?.playtime && movie.files?.[0]?.totalDuration)
                    ? movie.playState.playtime / movie.files[0].totalDuration
                    : undefined}
                  onWatchlist
                />
              );
            }
            const s = item as Series;
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
                onWatchlist
              />
            );
          })}
        </div>
      )}
    </>
  );
}
