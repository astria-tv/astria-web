import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Movies from './Movies';
import MovieDetails from './MovieDetails';
import Series from './Series';
import SeriesDetails from './SeriesDetails';
import Player from './Player';
import AppLayout from './AppLayout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const jwt = sessionStorage.getItem('jwt');
  if (!jwt) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <AppLayout><Dashboard /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/movies"
          element={
            <RequireAuth>
              <AppLayout><Movies /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/movie/:uuid"
          element={
            <RequireAuth>
              <AppLayout><MovieDetails /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/series"
          element={
            <RequireAuth>
              <AppLayout><Series /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/series/:uuid"
          element={
            <RequireAuth>
              <AppLayout><SeriesDetails /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/play/:fileUuid"
          element={
            <RequireAuth>
              <Player />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
