import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WallChatMessageEntity } from '../../entities/index.js';
import { WallChatMessage, WallChatRepository } from './wall-chat.repository.js';

/** Pg : violation de contrainte d'unicite. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: string }).code === '23505';

@Injectable()
export class TypeormWallChatRepository extends WallChatRepository {
  constructor(
    @InjectRepository(WallChatMessageEntity)
    private readonly rows: Repository<WallChatMessageEntity>,
  ) {
    super();
  }

  async saveIfAbsent(message: WallChatMessage): Promise<boolean> {
    if (await this.rows.existsBy({ id: message.id })) return false;
    try {
      await this.rows.insert(message);
      return true;
    } catch (error) {
      // Deux jobs concurrents pour le meme message : la cle primaire a tranche.
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async recent(projectId: string, limit: number): Promise<WallChatMessage[]> {
    const rows = await this.rows.find({
      where: { projectId },
      order: { sentAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }
}
