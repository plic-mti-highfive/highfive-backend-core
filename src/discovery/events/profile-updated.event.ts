export class ProfileUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly tenantId: string,
    public readonly changes: Record<string, any>,
  ) {}
}
