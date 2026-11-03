import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { api } from '../lib/api';

export function Protected({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });

  if (me.isPending) {
    return (
      <div className="boot">
        <span className="boot-dot" />
        Connecting to the LAN service
      </div>
    );
  }

  if (me.isError) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
