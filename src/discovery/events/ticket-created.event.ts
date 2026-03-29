export class TicketCreatedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly projectId: string,
    public readonly tenantId: string,
  ) {}
}
