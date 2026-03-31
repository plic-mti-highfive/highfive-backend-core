import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectsService } from './projects.service.js';
import { Project } from './entities/project.entity.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import {
  ProjectStatus,
  ProjectVisibility,
  ProjectRole,
} from '../../shared/enums/index.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepo: any;
  let membersService: Partial<ProjectMembersService>;
  let eventEmitter: Partial<EventEmitter2>;

  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(async () => {
    projectRepo = {
      create: vi.fn().mockImplementation((data) => ({ id: 'proj-1', ...data })),
      save: vi.fn().mockImplementation((data) => ({ id: 'proj-1', ...data })),
      findOne: vi.fn(),
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
      softDelete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    membersService = {
      addOwner: vi.fn().mockResolvedValue({}),
      assertRole: vi.fn().mockResolvedValue({
        projectId: 'proj-1',
        userId,
        tenantId,
        role: ProjectRole.OWNER,
      }),
    };

    eventEmitter = { emit: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: ProjectMembersService, useValue: membersService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    it('should create project and add creator as OWNER', async () => {
      const result = await service.create(tenantId, userId, {
        name: 'My Project',
      });

      expect(result.name).toBe('My Project');
      expect(result.tenantId).toBe(tenantId);
      expect(membersService.addOwner).toHaveBeenCalledWith(
        tenantId,
        'proj-1',
        userId,
      );
    });
  });

  describe('update', () => {
    it('should emit event when visibility changes', async () => {
      projectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        tenantId,
        visibility: ProjectVisibility.PRIVATE,
      });

      await service.update(tenantId, 'proj-1', userId, {
        visibility: ProjectVisibility.PUBLIC,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'project.visibility.changed',
        expect.objectContaining({
          oldVisibility: ProjectVisibility.PRIVATE,
          newVisibility: ProjectVisibility.PUBLIC,
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('should soft delete project (OWNER only)', async () => {
      await service.softDelete(tenantId, 'proj-1', userId);

      expect(membersService.assertRole).toHaveBeenCalledWith(
        tenantId,
        'proj-1',
        userId,
        [ProjectRole.OWNER],
      );
      expect(projectRepo.softDelete).toHaveBeenCalledWith({
        id: 'proj-1',
        tenantId,
      });
    });
  });
});
