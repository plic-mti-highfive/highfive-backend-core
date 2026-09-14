import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/decorators.js';
import type { Tag } from '../../contracts/index.js';
import { TagsService } from './tags.service.js';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  /** `GET /api/tags` — liste fermee des themes actifs (R-T1/R-T2). */
  @Public()
  @Get()
  list(): Promise<Tag[]> {
    return this.tags.listActive();
  }
}
