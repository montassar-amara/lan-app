import { CreateReadingDto, HealthDto, LoginDto, ReadingDto, SessionUserDto } from '@app/shared';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText || 'Request failed';
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // keep the status text
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export const api = {
  health: async () => HealthDto.parse(await request('/api/health')),

  me: async () => SessionUserDto.parse(await request('/api/auth/me')),

  login: async (username: string, password: string) => {
    const body = LoginDto.parse({ username, password });
    return SessionUserDto.parse(
      await request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    );
  },

  logout: () => request('/api/auth/logout', { method: 'POST' }),

  readings: async () => ReadingDto.array().parse(await request('/api/readings')),

  createReading: async (value: number) => {
    const body = CreateReadingDto.parse({ value });
    return ReadingDto.parse(
      await request('/api/readings', { method: 'POST', body: JSON.stringify(body) }),
    );
  },
};
