import { Module } from '@nestjs/common';
import { DomainEventsLogger } from './domain-events-logger.service.js';

@Module({
  providers: [DomainEventsLogger],
})
export class DomainEventsModule {}
