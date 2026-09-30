import { useState } from 'react';
import { supabase } from '../lib/supabase';
import ErrorMessage from '../components/ErrorMessage';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (isSignup) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim() } },
        });

        if (signupError) throw signupError;

        if (data.session) {
          setMessage('Account created.');
        } else {
          setMessage('Account created. Check your email if confirmation is enabled, then sign in.');
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginError) throw loginError;
      }
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="eyebrow">PRIVATE VIDEO MEETINGS</div>
        <h1>MEnU Meet</h1>
        <p className="muted">Simple browser meetings for your private group.</p>

        {isSignup && (
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Choose a username"
              autoComplete="username"
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        <ErrorMessage>{error}</ErrorMessage>
        {message && <div className="success-message">{message}</div>}

        <button className="button" disabled={busy}>
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <button
          type="button"
          className="button button-ghost"
          onClick={() => {
            setMode(isSignup ? 'login' : 'signup');
            setError('');
            setMessage('');
          }}
        >
          {isSignup ? 'Back to sign in' : 'Create an account'}
        </button>
      </form>
    </main>
  );
}
