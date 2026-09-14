#!/usr/bin/env node
/**
 * Compare les routes declarees par les controleurs avec celles du contrat
 * (`openapi.yaml`, copie du front).
 *
 * C'est le garde-fou de la regle de travail : le backend suit le contrat. Toute
 * divergence doit etre voulue et listee ci-dessous — la messagerie et les
 * routes hors contrat le sont (`docs/REFACTO-V2.md`).
 *
 * La lecture se fait sur les sources plutot que sur une API demarree : le
 * controle reste utilisable en integration continue, sans base ni Redis.
 *
 * Usage : node scripts/contract-diff.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const ROOT = new URL('..', import.meta.url).pathname;

/** Absences et ajouts assumes : tout le reste est une derive. */
const EXPECTED_MISSING = [
  // Messagerie : lot suivant (docs/REFACTO-V2.md §3).
  'GET /conversations',
  'POST /conversations',
  'GET /conversations/:conversationId',
  'GET /conversations/:conversationId/messages',
  'POST /conversations/:conversationId/messages',
  'POST /conversations/:conversationId/read',
  'PATCH /messages/:messageId',
  'DELETE /messages/:messageId',
];

const EXPECTED_EXTRA = [
  'GET /health',
  'GET /health/ready',
  // Le Mur : fonctions conservees sans ecran (docs/CANVAS.md §2).
  'GET /projects/:slug/wall/session',
  'POST /projects/:slug/wall/suggest-tasks',
  'POST /projects/:slug/wall/suggested-tasks',
  // Sans creation de signalement, la file de moderation est vide.
  'POST /reports',
];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.controller.ts') || entry === 'health.controller.ts'
      ? [path]
      : [];
  });
}

const normalise = (path) =>
  '/' + path.split('/').filter(Boolean).join('/');

function routesOf(file) {
  const source = readFileSync(file, 'utf8');
  const prefix = /@Controller\(\s*(?:'([^']*)')?\s*\)/.exec(source)?.[1] ?? '';
  const routes = [];

  const pattern = /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, method, path = ''] = match;
    routes.push(
      `${method.toUpperCase()} ${normalise(`${prefix}/${path}`)}`,
    );
  }
  return routes;
}

const served = new Set(
  [...sourceFiles(join(ROOT, 'src'))].flatMap(routesOf),
);

const spec = parse(readFileSync(join(ROOT, 'openapi.yaml'), 'utf8'));
const contract = new Set();
for (const [path, operations] of Object.entries(spec.paths)) {
  const route = path.replace(/\{(\w+)\}/g, ':$1');
  for (const method of Object.keys(operations)) {
    if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
      contract.add(`${method.toUpperCase()} ${route}`);
    }
  }
}

const missing = [...contract].filter((route) => !served.has(route)).sort();
const extra = [...served].filter((route) => !contract.has(route)).sort();
const unexpectedMissing = missing.filter((r) => !EXPECTED_MISSING.includes(r));
const unexpectedExtra = extra.filter((r) => !EXPECTED_EXTRA.includes(r));

console.log(`Contrat : ${contract.size} operations — servies : ${served.size}`);
console.log(`Absences assumees : ${missing.length - unexpectedMissing.length}`);
console.log(`Ajouts assumes    : ${extra.length - unexpectedExtra.length}`);

for (const route of unexpectedMissing) console.log(`  MANQUANTE  ${route}`);
for (const route of unexpectedExtra) console.log(`  EN TROP    ${route}`);

const drift = unexpectedMissing.length + unexpectedExtra.length;
console.log(drift === 0 ? '\nAucune derive.' : `\n${drift} derive(s).`);
process.exit(drift === 0 ? 0 : 1);
