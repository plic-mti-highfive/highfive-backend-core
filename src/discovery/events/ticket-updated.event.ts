export class TicketUpdatedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, any>,
  ) {}
}
