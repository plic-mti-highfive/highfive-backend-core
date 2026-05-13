import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants.js';
import { QueueBridgeService } from './queue-bridge.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.AI_TASKS },
      { name: QUEUE_NAMES.FAST_EVENTS },
    ),
  ],
  providers: [QueueBridgeService],
  exports: [QueueBridgeService, BullModule],
})
export class QueueModule {}
