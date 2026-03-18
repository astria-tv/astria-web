import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Login.css';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        body: JSON.stringify({ username, password, code }),
      });

      const data: { has_error: boolean; message: string } = await res.json();

      if (data.has_error) {
        throw new Error(data.message || 'Registration failed');
      }

      // Registration successful — redirect to login
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <h1>Create Account</h1>
          <p className="subtitle">Use an invite code to register on this server</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="invite-code">Invite Code</label>
              <input
                type="text"
                id="invite-code"
                placeholder="Paste your invite code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-username">Username</label>
              <input
                type="text"
                id="reg-username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-password">Password</label>
              <input
                type="password"
                id="reg-password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <input
                type="password"
                id="reg-confirm"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="register-link">
            Already have an account? <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
