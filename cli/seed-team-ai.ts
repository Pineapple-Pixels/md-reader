#!/usr/bin/env tsx
// Seed inicial del equipo team-ai con sus usuarios.
// Idempotente: omite users/team que ya existen.
// Uso: tsx --env-file=.env cli/seed-team-ai.ts

import { createUser, findByUsername } from '../src/lib/users.js';
import { createTeam, findBySlug, addMember } from '../src/lib/teams.js';
import { closeDb } from '../src/lib/db.js';

const TEAM_SLUG = 'team-ai';
const TEAM_NAME = 'Team AI';

const USERS: { username: string; password: string }[] = [
  { username: 'juan',  password: 'juan#123' },
  { username: 'pablo', password: 'pablo#123' },
  { username: 'sebas', password: 'sebas#123' },
  { username: 'leo',   password: 'leo#123' },
  { username: 'joaco', password: 'joaco#123' },
  { username: 'juli',  password: 'juli#123' },
  { username: 'alan',  password: 'alan#123' },
  { username: 'fran',  password: 'fran#123' },
  { username: 'ale',   password: 'ale#123' },
  { username: 'rocio', password: 'rocio#123' },
];

async function main(): Promise<void> {
  // 1. Crear el team si no existe
  let team = await findBySlug(TEAM_SLUG);
  if (team) {
    console.log(`[seed] team ya existe: ${TEAM_SLUG}`);
  } else {
    team = await createTeam({ slug: TEAM_SLUG, name: TEAM_NAME });
    console.log(`[seed] team creado: ${team.slug}`);
  }

  // 2. Crear cada user y agregarlo al team
  for (const { username, password } of USERS) {
    const existing = await findByUsername(username);
    if (existing) {
      console.log(`[seed] user ya existe, saltando creacion: ${username}`);
    } else {
      await createUser({ username, password, role: 'member' });
      console.log(`[seed] user creado: ${username}`);
    }
    await addMember(TEAM_SLUG, username, 'member');
    console.log(`[seed] ${username} → ${TEAM_SLUG}`);
  }

  console.log('[seed] listo.');
}

main()
  .catch((err) => {
    console.error('[seed] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
