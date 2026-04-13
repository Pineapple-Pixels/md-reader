#!/usr/bin/env tsx
// CLI de gestion de teams. Uso:
//   tsx cli/team.ts create <slug> <name>
//   tsx cli/team.ts delete <slug>
//   tsx cli/team.ts list
//   tsx cli/team.ts add-user <slug> <username> [--role=admin|member]
//   tsx cli/team.ts remove-user <slug> <username>
//   tsx cli/team.ts members <slug>

import {
  createTeam,
  deleteTeam,
  listTeams,
  addMember,
  removeMember,
  listMembers,
  findBySlug,
} from '../src/lib/teams.js';
import { closeDb } from '../src/lib/db.js';

type Parsed = {
  positional: string[];
  flags: Record<string, string>;
};

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      const key = match[1];
      const val = match[2];
      if (key !== undefined && val !== undefined) flags[key] = val;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function usage(): never {
  console.error(`Uso:
  tsx cli/team.ts create <slug> <name>
  tsx cli/team.ts delete <slug>
  tsx cli/team.ts list
  tsx cli/team.ts add-user <slug> <username> [--role=admin|member]
  tsx cli/team.ts remove-user <slug> <username>
  tsx cli/team.ts members <slug>`);
  process.exit(1);
}

async function cmdCreate(args: Parsed): Promise<void> {
  const [slug, ...nameParts] = args.positional;
  const name = nameParts.join(' ');
  if (!slug || !name) usage();
  const existing = await findBySlug(slug);
  if (existing) {
    console.error(`[team] ya existe: ${slug}`);
    process.exit(1);
  }
  const team = await createTeam({ slug, name });
  console.log(`[team] creado id=${team.id} slug=${team.slug} name="${team.name}"`);
}

async function cmdDelete(args: Parsed): Promise<void> {
  const [slug] = args.positional;
  if (!slug) usage();
  const ok = await deleteTeam(slug);
  if (!ok) {
    console.error(`[team] no encontrado: ${slug}`);
    process.exit(1);
  }
  console.log(`[team] eliminado: ${slug}`);
}

async function cmdList(): Promise<void> {
  const { data: teams } = await listTeams();
  if (teams.length === 0) {
    console.log('[team] no hay teams');
    return;
  }
  console.log('ID\tSLUG\tNAME');
  for (const t of teams) {
    console.log(`${t.id}\t${t.slug}\t${t.name}`);
  }
}

async function cmdAddUser(args: Parsed): Promise<void> {
  const [slug, username] = args.positional;
  if (!slug || !username) usage();
  const roleFlag = args.flags['role'] ?? 'member';
  if (roleFlag !== 'admin' && roleFlag !== 'member') {
    console.error(`[team] role invalido: ${roleFlag} (usar 'admin' o 'member')`);
    process.exit(1);
  }
  await addMember(slug, username, roleFlag);
  console.log(`[team] ${username} agregado a ${slug} como ${roleFlag}`);
}

async function cmdRemoveUser(args: Parsed): Promise<void> {
  const [slug, username] = args.positional;
  if (!slug || !username) usage();
  const ok = await removeMember(slug, username);
  if (!ok) {
    console.error(`[team] membership no encontrado: team=${slug} user=${username}`);
    process.exit(1);
  }
  console.log(`[team] ${username} removido de ${slug}`);
}

async function cmdMembers(args: Parsed): Promise<void> {
  const [slug] = args.positional;
  if (!slug) usage();
  const { data: members } = await listMembers(slug);
  if (members.length === 0) {
    console.log(`[team] ${slug} sin miembros`);
    return;
  }
  console.log('ROLE\tUSERNAME');
  for (const m of members) {
    console.log(`${m.role}\t${m.username}`);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();
  const args = parseArgs(rest);
  switch (cmd) {
    case 'create':      await cmdCreate(args); break;
    case 'delete':      await cmdDelete(args); break;
    case 'list':        await cmdList(); break;
    case 'add-user':    await cmdAddUser(args); break;
    case 'remove-user': await cmdRemoveUser(args); break;
    case 'members':     await cmdMembers(args); break;
    default: usage();
  }
}

main()
  .catch((err) => {
    console.error('[team] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
