import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Project } from '../../project-execution/projects/entities/project.entity.js';
import { User } from '../../identity/users/entities/user.entity.js';
import { Tag } from '../../project-execution/tags/entities/tag.entity.js';

// NOTE: boilerplate full-text-ish search.
// Implementation uses plain ILIKE on a few columns; replace with Postgres
// FTS / pgvector hybrid search when the discovery context lands.
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
  ) {}

  async search(tenantId: string, query: string, limit = 10) {
    // boilerplate: trim + bail early on empty queries
    const q = query?.trim();
    if (!q) return { projects: [], users: [], tags: [] };

    const pattern = `%${q}%`;

    const [projects, users, tags] = await Promise.all([
      this.projectRepo.find({
        where: [
          { tenantId, name: ILike(pattern) },
          { tenantId, description: ILike(pattern) },
        ],
        relations: ['tags'],
        take: limit,
      }),
      this.userRepo.find({
        where: { tenantId, email: ILike(pattern) },
        relations: ['profile'],
        take: limit,
      }),
      this.tagRepo.find({
        where: { tenantId, name: ILike(pattern) },
        take: limit,
      }),
    ]);

    return { projects, users, tags };
  }
}
