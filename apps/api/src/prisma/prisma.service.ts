import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from '../env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // small pool: the target PC is weak
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }) });
  }

  async onModuleInit() {
    await this.$connect(); // fails fast if the DB is down
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
