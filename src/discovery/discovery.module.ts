import { Module } from '@nestjs/common';
import { DiscoveryService } from './discovery.service.js';

@Module({
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
