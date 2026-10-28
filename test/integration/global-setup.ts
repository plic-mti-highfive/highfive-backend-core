import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Socket } from 'node:net';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * Infrastructure jetable des tests d'integration.
 *
 * - En CI, `TEST_DATABASE_URL` (URL d'un compte PostgreSQL pouvant creer des
 *   bases) et `TEST_REDIS_URL` pointent vers les `services:` du workflow.
 * - En local, on demarre un PostgreSQL et un Redis a usage unique via la CLI
 *   docker, sur un port aleatoire de 127.0.0.1, et on les arrete a la fin.
 *
 * On ne se connecte jamais a une base de developpement : seule une instance
 * creee ici (ou fournie explicitement par la CI) est utilisee.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL administrateur de PostgreSQL (base `postgres`). */
    testDatabaseUrl: string;
    /** URL de Redis. */
    testRedisUrl: string;
  }
}

const POSTGRES_PASSWORD = 'hf-test';

const docker = (args: string[]): string =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();

/** `docker port` renvoie `127.0.0.1:49153` : on n'en garde que le port. */
function hostPort(container: string, internal: number): number {
  const line = docker(['port', container, `${internal}/tcp`])
    .split('\n')
    .find((entry) => entry.startsWith('127.0.0.1:'));
  if (!line) throw new Error(`Port ${internal} introuvable pour ${container}`);
  return Number(line.slice(line.lastIndexOf(':') + 1));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  what: string,
  probe: () => Promise<void>,
  attempts = 60,
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await probe();
      return;
    } catch (error) {
      last = error;
      await sleep(500);
    }
  }
  throw new Error(`${what} n'est pas pret : ${String(last)}`);
}

async function probePostgres(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

function probeTcp(url: string): Promise<void> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('delai depasse')));
    socket.connect(Number(port), hostname);
  });
}

export default async function setup(project: TestProject) {
  const containers: string[] = [];
  const stop = (): void => {
    for (const name of containers.splice(0)) {
      try {
        docker(['rm', '-f', name]);
      } catch {
        // deja arrete (--rm) : rien a faire
      }
    }
  };

  let databaseUrl = process.env.TEST_DATABASE_URL;
  let redisUrl = process.env.TEST_REDIS_URL;

  try {
    if (!databaseUrl) {
      const name = `hf-core-test-pg-${randomBytes(4).toString('hex')}`;
      containers.push(name);
      docker([
        'run',
        '-d',
        '--rm',
        '--tmpfs',
        '/var/lib/postgresql/data',
        '-p',
        '127.0.0.1::5432',
        '-e',
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        '--name',
        name,
        'postgres:16-alpine',
        '-c',
        'fsync=off',
        '-c',
        'max_connections=300',
      ]);
      databaseUrl = `postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${hostPort(name, 5432)}/postgres`;
    }

    if (!redisUrl) {
      const name = `hf-core-test-redis-${randomBytes(4).toString('hex')}`;
      containers.push(name);
      docker([
        'run',
        '-d',
        '--rm',
        '-p',
        '127.0.0.1::6379',
        '--name',
        name,
        'redis:7-alpine',
      ]);
      redisUrl = `redis://127.0.0.1:${hostPort(name, 6379)}`;
    }

    await waitFor('PostgreSQL', () => probePostgres(databaseUrl!));
    await waitFor('Redis', () => probeTcp(redisUrl!));
  } catch (error) {
    stop();
    throw error;
  }

  project.provide('testDatabaseUrl', databaseUrl);
  project.provide('testRedisUrl', redisUrl);

  // Appele par vitest en fin de run, reussi ou non.
  return stop;
}
