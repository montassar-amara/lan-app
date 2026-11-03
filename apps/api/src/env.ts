import { z } from 'zod';

export const env = z
  .object({
    PORT: z.coerce.number().default(8080),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    ADMIN_USER: z.string().default('admin'),
    ADMIN_PASS: z.string().min(12).optional(), // only used to seed the first admin
  })
  .parse(process.env);
