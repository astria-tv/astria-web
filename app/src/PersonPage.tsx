import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJwt, handleAuthFailure } from './auth';
import './PersonPage.css';
import { ImageIcon } from './Icons';
import PosterCard from './PosterCard';

/* ─── Types ─── */
interface StreamInfo {
  codecName: string | null;
  bitRate: number | null;
  streamType: string | null;
  resolution: string | null;
}

interface PlayState {
  finished: boolean;
  playtime: number;
}

interface FileInfo {
  uuid: string;
  totalDuration: number | null;
  fileSize: string;
  streams: StreamInfo[];
}

interface MovieMedia {
  __typename: 'Movie';
  title: string;
  posterURL: string;
  uuid: string;
  year: string;
  playState: PlayState | null;
  files: FileInfo[];
  onWatchlist: boolean;
}

interface SeriesMedia {
  __typename: 'Series';
  name: string;
  posterPath: string;
  uuid: string;
  firstAirDate: string;
  unwatchedEpisodesCount: number;
  onWatchlist: boolean;
}

type MediaItem = MovieMedia | SeriesMedia;

interface PersonCastRole {
  character: string;
  media: MediaItem;
}

interface Person {
  name: string;
  tmdbID: number;
  profilePath: string;
  biography: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  castRoles: PersonCastRole[];
}

/* ─── Query ─── */
const PERSON_QUERY = `query Person($tmdbID: Int!) {
  person(tmdbID: $tmdbID) {
    name
    tmdbID
    profilePath
    biography
    birthday
    deathday
    placeOfBirth
    castRoles {
      character
      media {
        __typename
        ... on Movie {
          title
          posterURL(width: 300)
          uuid
          year
          playState { finished playtime }
          files {
            uuid
            totalDuration
            fileSize
            streams { codecName bitRate streamType resolution }
          }
          onWatchlist
        }
        ... on Series {
          name
          posterPath
          uuid
          firstAirDate
          unwatchedEpisodesCount
          onWatchlist
        }
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function calculateAge(birthday: string, deathday: string): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (isNaN(birth.getTime())) return null;
  const end = deathday ? new Date(deathday) : new Date();
  if (isNaN(end.getTime())) return null;
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
  return age;
}

async function gqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const jwt = getJwt();
  const res = await fetch('/astria/m/query', {
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
export default function PersonPage() {
  const { tmdbID } = useParams<{ tmdbID: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    const id = parseInt(tmdbID ?? '', 10);
    if (isNaN(id)) { setError('Invalid person ID'); setLoading(false); return; }
    setLoading(true);
    gqlFetch<{ person: Person | null }>(PERSON_QUERY, { tmdbID: id })
      .then(data => {
        if (data.person) {
          setPerson(data.person);
        } else {
          setError('Person not found');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [tmdbID]);

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  if (error || !person) {
    return (
      <div className="error-state">
        <p>{error ?? 'Person not found'}</p>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const age = calculateAge(person.birthday, person.deathday);
  const bioIsLong = person.biography.length > 600;

  return (
    <div className="person-page">
      {/* Hero area */}
      <div className="person-hero">
        <div className="person-hero-bg" />

        <div className="person-hero-content">
          <div className="person-photo">
            {person.profilePath ? (
              <img
                src={person.profilePath}
                alt={person.name}
                onLoad={e => e.currentTarget.classList.add('loaded')}
              />
            ) : (
              <div className="person-photo-placeholder">
                <ImageIcon />
              </div>
            )}
          </div>

          <div className="person-header-info">
            <h1>{person.name}</h1>

            <div className="person-meta">
              {person.birthday && (
                <span>
                  Born {formatDate(person.birthday)}
                  {age !== null && !person.deathday && ` (age ${age})`}
                </span>
              )}
              {person.deathday && (
                <span>
                  Died {formatDate(person.deathday)}
                  {age !== null && ` (age ${age})`}
                </span>
              )}
              {person.placeOfBirth && <span>{person.placeOfBirth}</span>}
            </div>

            {person.biography && (
              <div className={`person-bio${bioIsLong && !bioExpanded ? ' collapsed' : ''}`}>
                <p>{person.biography}</p>
                {bioIsLong && (
                  <button
                    className="bio-toggle"
                    onClick={() => setBioExpanded(v => !v)}
                  >
                    {bioExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filmography */}
      {person.castRoles.length > 0 && (
        <div className="person-filmography">
          <h2>Filmography <span className="role-count">{person.castRoles.length}</span></h2>
          <div className="filmography-grid">
            {person.castRoles.map((role, i) => {
              const isMovie = role.media.__typename === 'Movie';
              const movie = isMovie ? (role.media as MovieMedia) : null;
              const series = !isMovie ? (role.media as SeriesMedia) : null;
              const title = movie ? movie.title : series!.name;
              const posterUrl = movie ? movie.posterURL : tmdbImg(series!.posterPath);
              const year = movie ? movie.year : series!.firstAirDate?.slice(0, 4);
              const path = movie ? `/movie/${movie.uuid}` : `/series/${series!.uuid}`;
              const uuid = movie ? movie.uuid : series!.uuid;

              const subtitleParts: string[] = [];
              if (role.character) subtitleParts.push(`as ${role.character}`);
              if (year) subtitleParts.push(year);
              const subtitle = subtitleParts.join(' · ');

              return (
                <PosterCard
                  key={`${role.media.__typename}-${uuid}-${i}`}
                  posterUrl={posterUrl}
                  title={title}
                  subtitle={subtitle}
                  detailPath={path}
                  mediaType={isMovie ? 'movie' : 'series'}
                  mediaUuid={uuid}
                  seriesUuid={series ? series.uuid : undefined}
                  files={movie?.files}
                  playState={movie?.playState}
                  watched={movie ? movie.playState?.finished : series!.unwatchedEpisodesCount === 0}
                  progress={movie && !movie.playState?.finished && movie.playState?.playtime && movie.files?.[0]?.totalDuration
                    ? movie.playState.playtime / movie.files[0].totalDuration
                    : undefined}
                  onWatchlist={movie ? movie.onWatchlist : series!.onWatchlist}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
