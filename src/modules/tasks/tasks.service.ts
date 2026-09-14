import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  Column as ColumnDto,
  ColumnCreateInput,
  Task,
  TaskCreateInput,
  TaskMoveInput,
  TaskUpdateInput,
} from '../../contracts/index.js';
import {
  ColumnEntity,
  MembershipEntity,
  ProjectEntity,
  TaskEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toColumn, toTask } from '../../common/mappers/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

/** R-K2 : de 1 a 6 colonnes par projet. */
const MAX_COLUMNS = 6;

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(ColumnEntity)
    private readonly columns: Repository<ColumnEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async listColumns(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<ColumnDto[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const rows = await this.columns.find({
      where: { projectId: project.id },
      order: { order: 'ASC' },
    });
    return rows.map(toColumn);
  }

  async createColumn(
    slug: string,
    actor: UserEntity,
    input: ColumnCreateInput,
  ): Promise<ColumnDto> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    const count = await this.columns.count({
      where: { projectId: project.id },
    });
    if (count >= MAX_COLUMNS) {
      throw ApiError.validation(
        `Un projet ne peut pas avoir plus de ${MAX_COLUMNS} colonnes.`,
      );
    }

    const column = await this.columns.save(
      this.columns.create({
        projectId: project.id,
        label: input.label,
        color: input.color ?? null,
        order: count,
      }),
    );

    await this.access.touch(project.id);
    return toColumn(column);
  }

  /**
   * R-K3 : supprimer une colonne exige une destination pour ses taches, et la
   * derniere colonne ne se supprime pas — un tableau sans colonne ne serait
   * plus un tableau.
   */
  async removeColumn(
    actor: UserEntity,
    columnId: string,
    moveTo: string | undefined,
  ): Promise<void> {
    const column = await this.findColumnOrFail(columnId);
    const project = await this.access.findByIdOrFail(column.projectId);
    await this.access.assertRole(project, actor, 'co_owner');

    const siblings = await this.columns.find({
      where: { projectId: project.id },
      order: { order: 'ASC' },
    });
    if (siblings.length <= 1) {
      throw ApiError.validation(
        'Un projet garde au moins une colonne dans Les Taches.',
      );
    }

    const destination = siblings.find(
      (candidate) => candidate.id === moveTo && candidate.id !== column.id,
    );
    if (!destination) {
      throw ApiError.validation(
        'Indique dans quelle colonne deplacer les taches avant de supprimer celle-ci.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const moved = await manager.find(TaskEntity, {
        where: { columnId: column.id },
        order: { order: 'ASC' },
      });
      const offset = await manager.count(TaskEntity, {
        where: { columnId: destination.id },
      });

      // Les taches sont replacees a la suite de celles qui existent deja,
      // dans leur ordre d'origine : rien ne disparait, rien ne se melange.
      for (const [index, task] of moved.entries()) {
        await manager.update(
          TaskEntity,
          { id: task.id },
          { columnId: destination.id, order: offset + index },
        );
      }

      await manager.delete(ColumnEntity, { id: column.id });

      const remaining = siblings.filter(
        (candidate) => candidate.id !== column.id,
      );
      for (const [index, sibling] of remaining.entries()) {
        await manager.update(
          ColumnEntity,
          { id: sibling.id },
          { order: index },
        );
      }
    });

    await this.access.touch(project.id);
  }

  async listTasks(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<Task[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const columns = await this.columns.find({
      where: { projectId: project.id },
    });
    if (columns.length === 0) return [];

    const rows = await this.tasks.find({
      where: { columnId: In(columns.map((column) => column.id)) },
      order: { order: 'ASC' },
    });
    return rows.map(toTask);
  }

  /** R-K4 : seul le titre est obligatoire. */
  async createTask(actor: UserEntity, input: TaskCreateInput): Promise<Task> {
    const column = await this.findColumnOrFail(input.columnId);
    const project = await this.access.findByIdOrFail(column.projectId);
    await this.access.assertRole(project, actor, 'member');

    const order = await this.tasks.count({ where: { columnId: column.id } });
    const assignees = await this.resolveAssignees(
      project.id,
      input.assigneeIds ?? [],
    );

    const task = await this.tasks.save(
      this.tasks.create({
        columnId: column.id,
        title: input.title,
        details: input.details ?? null,
        dueDate: input.dueDate ?? null,
        assignees,
        order,
        createdBy: actor.id,
      }),
    );

    await this.notifyAssignees(
      actor,
      task,
      assignees.map((user) => user.id),
    );
    await this.access.touch(project.id);

    return toTask(task);
  }

  async updateTask(
    actor: UserEntity,
    taskId: string,
    input: TaskUpdateInput,
  ): Promise<Task> {
    const { task, project } = await this.taskContext(taskId);
    await this.access.assertRole(project, actor, 'member');

    const before = new Set((task.assignees ?? []).map((user) => user.id));

    if (input.title !== undefined) task.title = input.title;
    if (input.details !== undefined) task.details = input.details;
    // `dueDate` accepte explicitement `null` : c'est ainsi qu'on retire une
    // echeance, alors qu'`undefined` veut dire « ne touche pas ».
    if (input.dueDate !== undefined) task.dueDate = input.dueDate;
    if (input.assigneeIds !== undefined) {
      task.assignees = await this.resolveAssignees(
        project.id,
        input.assigneeIds,
      );
    }

    await this.tasks.save(task);

    const added = (task.assignees ?? [])
      .map((user) => user.id)
      .filter((id) => !before.has(id));
    await this.notifyAssignees(actor, task, added);
    await this.access.touch(project.id);

    return toTask(task);
  }

  /** Glisser-deposer : la position visee est reinseree, les voisines suivent. */
  async moveTask(
    actor: UserEntity,
    taskId: string,
    input: TaskMoveInput,
  ): Promise<Task> {
    const { task, project } = await this.taskContext(taskId);
    await this.access.assertRole(project, actor, 'member');

    const destination = await this.findColumnOrFail(input.columnId);
    if (destination.projectId !== project.id) {
      throw ApiError.validation(
        "Cette colonne n'appartient pas au meme projet.",
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const sourceColumnId = task.columnId;

      await manager.update(
        TaskEntity,
        { id: task.id },
        { columnId: destination.id },
      );

      // On renumerote les deux colonnes concernees de 0 a n : plus simple et
      // plus sur qu'une arithmetique d'insertion, pour des colonnes qui
      // comptent quelques dizaines de taches au plus.
      await this.renumber(manager, destination.id, task.id, input.order);
      if (sourceColumnId !== destination.id) {
        await this.renumber(manager, sourceColumnId, null, 0);
      }
    });

    await this.access.touch(project.id);
    return toTask(await this.tasks.findOneOrFail({ where: { id: task.id } }));
  }

  async removeTask(actor: UserEntity, taskId: string): Promise<void> {
    const { task, project } = await this.taskContext(taskId);
    await this.access.assertRole(project, actor, 'member');

    await this.notifications.dropForTargets('task', [task.id]);
    await this.tasks.delete({ id: task.id });
    await this.access.touch(project.id);
  }

  /**
   * R-W2 : conversion d'elements du Mur en taches, dans la premiere colonne.
   * Ouvert au module Mur, qui connait les libelles a donner.
   */
  async createFromWall(
    actor: UserEntity,
    project: ProjectEntity,
    items: { elementId: string; title: string }[],
  ): Promise<Task[]> {
    const firstColumn = await this.columns.findOne({
      where: { projectId: project.id },
      order: { order: 'ASC' },
    });
    if (!firstColumn) {
      throw ApiError.notFound('Ce projet n a aucune colonne dans Les Taches.');
    }

    const offset = await this.tasks.count({
      where: { columnId: firstColumn.id },
    });

    const created = await this.tasks.save(
      items.map((item, index) =>
        this.tasks.create({
          columnId: firstColumn.id,
          title: item.title,
          assignees: [],
          order: offset + index,
          createdBy: actor.id,
          wallOriginId: item.elementId,
        }),
      ),
    );

    await this.access.touch(project.id);
    return created.map(toTask);
  }

  private async renumber(
    manager: DataSource['manager'],
    columnId: string,
    pinnedTaskId: string | null,
    pinnedOrder: number,
  ): Promise<void> {
    const tasks = await manager.find(TaskEntity, {
      where: { columnId },
      order: { order: 'ASC' },
    });

    const others = tasks.filter((task) => task.id !== pinnedTaskId);
    const pinned = tasks.find((task) => task.id === pinnedTaskId);

    const ordered = pinned
      ? [...others.slice(0, pinnedOrder), pinned, ...others.slice(pinnedOrder)]
      : others;

    for (const [index, task] of ordered.entries()) {
      await manager.update(TaskEntity, { id: task.id }, { order: index });
    }
  }

  /** R-K5 : on n'assigne qu'a des membres du projet. */
  private async resolveAssignees(
    projectId: string,
    userIds: string[],
  ): Promise<UserEntity[]> {
    if (userIds.length === 0) return [];

    const memberships = await this.memberships.find({
      where: { projectId, userId: In(userIds), blocked: false },
    });
    const allowed = new Set(memberships.map((row) => row.userId));

    const unknown = userIds.filter((id) => !allowed.has(id));
    if (unknown.length > 0) {
      throw ApiError.validation(
        "On ne peut assigner une tache qu'aux personnes de l'equipe.",
      );
    }

    return this.users.find({ where: { id: In(userIds) } });
  }

  /** R-K7 : assigner quelqu'un est le seul evenement des Taches qui notifie. */
  private async notifyAssignees(
    actor: UserEntity,
    task: TaskEntity,
    assigneeIds: string[],
  ): Promise<void> {
    await this.notifications.notifyMany(assigneeIds, {
      actorId: actor.id,
      type: 'task_assigned',
      targetType: 'task',
      targetId: task.id,
    });
  }

  private async findColumnOrFail(id: string): Promise<ColumnEntity> {
    const column = await this.columns.findOne({ where: { id } });
    if (!column) throw ApiError.notFound("Cette colonne n'existe pas.");
    return column;
  }

  private async taskContext(
    taskId: string,
  ): Promise<{ task: TaskEntity; project: ProjectEntity }> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw ApiError.notFound("Cette tache n'existe pas.");

    const column = await this.findColumnOrFail(task.columnId);
    return {
      task,
      project: await this.access.findByIdOrFail(column.projectId),
    };
  }
}
