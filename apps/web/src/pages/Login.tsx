import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../lib/api';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (me) => {
      queryClient.setQueryData(['me'], me);
      navigate('/', { replace: true });
    },
    onError: (cause) => {
      if (cause instanceof ApiError) {
        setError(cause.status === 401 ? 'That username and password do not match.' : cause.message);
      } else {
        setError('The LAN service is unreachable. Check that it is running.');
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter both a username and a password.');
      return;
    }
    login.mutate();
  }

  return (
    <main className="gate">
      <section className="gate-brand">
        <p className="eyebrow">Local network console</p>
        <h1>
          Readings,
          <br />
          kept close.
        </h1>
        <p className="gate-lede">
          This dashboard lives on your network. It keeps recording when the internet does not.
        </p>
        <div className="gate-rule" aria-hidden="true">
          <span />
        </div>
        <p className="gate-note">Access is limited to accounts created on this machine.</p>
      </section>

      <section className="gate-form">
        <div className="gate-form-inner">
          <p className="wordmark">
            LAN<span>/</span>APP
          </p>
          <h2>Sign in</h2>
          <p className="subtle">Use the account configured on this PC.</p>

          <form onSubmit={submit} noValidate>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="gate-foot">No internet connection required.</p>
        </div>
      </section>
    </main>
  );
}
