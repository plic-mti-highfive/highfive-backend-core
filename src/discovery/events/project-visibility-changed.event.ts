export class ProjectVisibilityChangedEvent {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly oldVisibility: string,
    public readonly newVisibility: string,
  ) {}
}
