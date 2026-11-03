import { z } from 'zod';

export const LoginDto = z.object({ username: z.string().min(1), password: z.string().min(1) });
export type LoginDto = z.infer<typeof LoginDto>;

export const ReadingDto = z.object({
  id: z.number().int(),
  value: z.number(),
  createdAt: z.string(),
});
export type ReadingDto = z.infer<typeof ReadingDto>;

export const CreateReadingDto = z.object({ value: z.number().finite() });
export type CreateReadingDto = z.infer<typeof CreateReadingDto>;

export const HealthDto = z.object({ ok: z.boolean(), version: z.string() });
export type HealthDto = z.infer<typeof HealthDto>;

export const SessionUserDto = z.object({ id: z.number().int(), username: z.string() });
export type SessionUserDto = z.infer<typeof SessionUserDto>;

