import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateReadingDto } from '@app/shared';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Sparkline } from '../components/Sparkline';
import { ApiError, api } from '../lib/api';

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export function Dashboard() {
  const [value, setValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000 });
  const readings = useQuery({
    queryKey: ['readings'],
    queryFn: api.readings,
    refetchInterval: 5_000,
  });

  const addReading = useMutation({
    mutationFn: (next: number) => api.createReading(next),
    onSuccess: () => {
      setValue('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['readings'] });
    },
    onError: (cause) => {
      if (cause instanceof ApiError) {
        setFormError(cause.status === 401 ? 'Your session expired. Sign in again.' : cause.message);
      } else {
        setFormError('Could not save the reading. Check that the service is running.');
      }
    },
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = CreateReadingDto.safeParse({ value: Number(value) });
    if (!parsed.success) {
      setFormError('Enter a finite number.');
      return;
    }
    addReading.mutate(parsed.data.value);
  }

  if (readings.isError) {
    const status = (readings.error as { status?: number }).status;
    if (status === 401) return <Navigate to="/login" replace />;
  }

  const rows = readings.data ?? [];
  const latest = rows[0];
  const traceValues = rows.map((row) => row.value).reverse();
  const updated = readings.dataUpdatedAt
    ? timeFormat.format(new Date(readings.dataUpdatedAt))
    : 'waiting';

  return (
    <div className="shell">
      <header className="topbar">
        <p className="wordmark">
          LAN<span>/</span>APP
        </p>
        <div className="topbar-right">
          <span className={`status ${health.isError ? 'is-down' : ''}`}>
            <i aria-hidden="true" />
            {health.isError ? 'Service unavailable' : (health.data?.version ?? 'Checking')}
          </span>
          <span className="who">{me.data?.username}</span>
          <button className="ghost" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Sign out
          </button>
        </div>
      </header>

      <main className="board">
        <section className="cell readout">
          <p className="eyebrow">Latest reading</p>
          <p className="figure">{latest ? numberFormat.format(latest.value) : '—'}</p>
          <p className="meta">
            {latest
              ? `#${latest.id} · ${timeFormat.format(new Date(latest.createdAt))}`
              : 'Nothing recorded yet'}
          </p>
        </section>

        <section className="cell trace-card">
          <div className="card-head">
            <h2>Trace</h2>
            <p>{rows.length > 0 ? `${rows.length} readings` : 'No readings'}</p>
          </div>
          <Sparkline values={traceValues} />
        </section>

        <section className="cell entry">
          <p className="eyebrow">Record a value</p>
          <form onSubmit={submit} noValidate>
            <label className="sr-only" htmlFor="reading-value">
              Value
            </label>
            <input
              id="reading-value"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 42.5"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <button type="submit" disabled={addReading.isPending}>
              {addReading.isPending ? 'Saving…' : 'Add reading'}
            </button>
          </form>
          <p className="hint">Values refresh every five seconds. Last check: {updated}.</p>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
        </section>

        <section className="cell history">
          <div className="card-head">
            <h2>History</h2>
            <p>Newest first · up to 100</p>
          </div>

          {readings.isPending ? (
            <p className="hint">Loading readings…</p>
          ) : rows.length === 0 ? (
            <p className="empty">No readings yet. Record the first value above.</p>
          ) : (
            <ol className="rows">
              {rows.map((row) => (
                <li key={row.id}>
                  <span className="row-id">#{row.id}</span>
                  <span className="row-value">{numberFormat.format(row.value)}</span>
                  <time className="row-time" dateTime={row.createdAt}>
                    {timeFormat.format(new Date(row.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
