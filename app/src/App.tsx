import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Movies from './Movies';
import MovieDetails from './MovieDetails';
import Series from './Series';
import SeriesDetails from './SeriesDetails';
import Player from './Player';
import AdminSettings from './AdminSettings';
import ActiveStreams from './ActiveStreams';
import UnmatchedMedia from './UnmatchedMedia';
import Register from './Register';
import Setup from './Setup';
import AppLayout from './AppLayout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const jwt = sessionStorage.getItem('jwt');
  if (!jwt) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Redirects to /setup when the server has no users yet */
function RedirectIfSetup({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch('/olaris/m/v1/user/setup')
      .then(r => r.text())
      .then(text => setNeedsSetup(text.trim() === 'true'))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectIfSetup><Login /></RedirectIfSetup>} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/register" element={<Register />} />
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
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AppLayout><AdminSettings /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/streams"
          element={
            <RequireAuth>
              <AppLayout><ActiveStreams /></AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/unmatched"
          element={
            <RequireAuth>
              <AppLayout><UnmatchedMedia /></AppLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
