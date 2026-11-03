import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.reading.findMany({ orderBy: { id: 'desc' }, take: 100 });
  }

  create(value: number) {
    return this.prisma.reading.create({ data: { value } });
  }
}
