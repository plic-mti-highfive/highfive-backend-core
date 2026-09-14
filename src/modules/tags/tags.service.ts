import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TAGS, type Tag } from '../../contracts/index.js';
import { TagEntity } from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toTag } from '../../common/mappers/index.js';

/**
 * Themes (R-T1/R-T2) : liste fermee, semee depuis le contrat partage avec le
 * front. Aucune route ne cree ni ne supprime un theme — la desactivation
 * (`active = false`) est la seule sortie prevue, et elle n'a pas encore de
 * route (voir `docs/REFACTO-V2.md`).
 */
@Injectable()
export class TagsService implements OnModuleInit {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tags: Repository<TagEntity>,
  ) {}

  /**
   * Le seed est rejoue a chaque demarrage : c'est une liste fermee de 24
   * lignes definie dans le contrat, donc la base doit y correspondre, pas
   * l'inverse. `active` n'est pas ecrase : une desactivation decidee par
   * l'administration survit au redemarrage.
   */
  async onModuleInit(): Promise<void> {
    const existing = await this.tags.find();
    const byId = new Map(existing.map((tag) => [tag.id, tag]));

    const rows = TAGS.map((tag) =>
      this.tags.create({
        id: tag.id,
        label: tag.label,
        family: tag.family,
        accent: tag.accent,
        active: byId.get(tag.id)?.active ?? true,
      }),
    );

    await this.tags.save(rows);
  }

  async listActive(): Promise<Tag[]> {
    const rows = await this.tags.find({ where: { active: true } });
    // L'ordre du contrat fait foi : c'est celui de la sous-barre de themes.
    const order = new Map(TAGS.map((tag, index) => [tag.id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(toTag);
  }

  /** Toutes les lignes, y compris desactivees (administration). */
  async listAll(): Promise<Tag[]> {
    const rows = await this.tags.find();
    const order = new Map(TAGS.map((tag, index) => [tag.id, index]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(toTag);
  }

  /**
   * Resout des identifiants de themes vers leurs lignes, en refusant tout
   * identifiant inconnu ou desactive : un projet ne doit jamais porter un
   * theme qui n'existe pas.
   */
  async resolveOrFail(ids: string[]): Promise<TagEntity[]> {
    const unique = [...new Set(ids)];
    const rows = await this.tags.find({
      where: { id: In(unique), active: true },
    });

    if (rows.length !== unique.length) {
      const found = new Set(rows.map((tag) => tag.id));
      const missing = unique.filter((id) => !found.has(id));
      throw ApiError.validation(
        `Ces themes n'existent pas : ${missing.join(', ')}.`,
      );
    }

    return rows;
  }
}
