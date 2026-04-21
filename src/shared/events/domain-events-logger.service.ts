import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DomainEventsLogger implements OnModuleInit {
  private readonly logger = new Logger('DomainEvents');

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit(): void {
    this.eventEmitter.onAny((event: string | string[], payload: unknown) => {
      const eventName = Array.isArray(event) ? event.join('.') : event;
      this.logger.log(`${eventName} ${this.stringify(payload)}`);
    });
  }

  private stringify(payload: unknown): string {
    try {
      return JSON.stringify(payload);
    } catch {
      return '[unserializable payload]';
    }
  }
}
