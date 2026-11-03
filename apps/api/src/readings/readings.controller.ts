import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateReadingDto, type ReadingDto } from '@app/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReadingsService } from './readings.service';

@Controller('readings')
export class ReadingsController {
  constructor(private readonly readings: ReadingsService) {}

  @Get()
  async list(): Promise<ReadingDto[]> {
    const rows = await this.readings.list();
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  @Post()
  async create(@Body(new ZodValidationPipe(CreateReadingDto)) body: CreateReadingDto): Promise<ReadingDto> {
    const row = await this.readings.create(body.value);
    return { ...row, createdAt: row.createdAt.toISOString() };
  }
}
