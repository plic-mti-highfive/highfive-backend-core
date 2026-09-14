import { Controller, Get, Module } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators.js';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Sonde de vivacite : ne touche a rien, repond toujours. */
  @Public()
  @Get()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Sonde de disponibilite : la base doit repondre pour servir quoi que ce soit. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string; database: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready', database: 'connected' };
    } catch {
      return { status: 'degraded', database: 'disconnected' };
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
