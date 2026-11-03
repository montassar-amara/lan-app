import './load-env';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: '127.0.0.1' }),
  );
  app.setGlobalPrefix('api');
  app.enableShutdownHooks(); // closes the Prisma pool when the service stops
  await app.register(cookie);
  await app.register(helmet, {
    hsts: false, // Caddy sets it; meaningless on LAN http
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
  });
  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap();
