import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { setJwt } from './auth';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/olaris/m/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember_me: rememberMe }),
      });

      if (!res.ok) {
        throw new Error('Invalid username or password');
      }

      const data = await res.json();
      setJwt(data.jwt, rememberMe);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="logo-area">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Astria" onLoad={e => e.currentTarget.classList.add('loaded')} />
          <p>Your personal media universe</p>
        </div>

        <div className="card">
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to your Astria server</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="options-row">
              <label>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /> Remember me
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="register-link">
            Have an invite code? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
