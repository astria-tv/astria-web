import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

export default function Setup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  /* If setup isn't actually needed, bounce to login */
  useEffect(() => {
    fetch('/olaris/m/v1/user/setup')
      .then(r => r.text())
      .then(text => {
        if (text.trim() !== 'true') navigate('/', { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/olaris/m/v1/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data: { has_error: boolean; message: string } = await res.json();

      if (data.has_error) {
        throw new Error(data.message || 'Account creation failed');
      }

      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="logo-area">
          <img src="/logo.svg" alt="Astria" onLoad={e => e.currentTarget.classList.add('loaded')} />
          <p>Your personal media universe</p>
        </div>

        <div className="card">
          <h1>Welcome to Astria</h1>
          <p className="subtitle">Create the first admin account to get started</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="setup-username">Username</label>
              <input
                type="text"
                id="setup-username"
                placeholder="Choose a username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="setup-password">Password</label>
              <input
                type="password"
                id="setup-password"
                placeholder="Choose a password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="setup-confirm">Confirm Password</label>
              <input
                type="password"
                id="setup-confirm"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
