import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

const version = (() => {
  // dist/health/health.controller.js -> release root is two levels up; also accept a controller
  // compiled at dist root so the contract keeps working if the file moves.
  for (const candidate of [join(__dirname, '..', 'VERSION'), join(__dirname, '..', '..', 'VERSION')]) {
    try {
      return readFileSync(candidate, 'utf8').trim();
    } catch {}
  }
  return 'dev';
})();

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, version };
  }
}
