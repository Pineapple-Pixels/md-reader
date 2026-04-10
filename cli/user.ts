#!/usr/bin/env tsx
// CLI de gestion de users. Uso:
//   tsx cli/user.ts create <username> <password> [--role=admin|member] [--name="Display Name"]
//   tsx cli/user.ts passwd <username> <newPassword>
//   tsx cli/user.ts delete <username>
//   tsx cli/user.ts list

import { createUser, updatePassword, deleteUser, listUsers, findByUsername } from '../src/lib/users.js';
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
  tsx cli/user.ts create <username> <password> [--role=admin|member] [--name="Display Name"]
  tsx cli/user.ts passwd <username> <newPassword>
  tsx cli/user.ts delete <username>
  tsx cli/user.ts list`);
  process.exit(1);
}

async function cmdCreate(args: Parsed): Promise<void> {
  const [username, password] = args.positional;
  if (!username || !password) usage();
  const roleFlag = args.flags['role'] ?? 'member';
  if (roleFlag !== 'admin' && roleFlag !== 'member') {
    console.error(`[user] role invalido: ${roleFlag} (usar 'admin' o 'member')`);
    process.exit(1);
  }
  const existing = await findByUsername(username);
  if (existing) {
    console.error(`[user] ya existe: ${username}`);
    process.exit(1);
  }
  const user = await createUser({
    username,
    password,
    role: roleFlag,
    ...(args.flags['name'] !== undefined ? { displayName: args.flags['name'] } : {}),
  });
  console.log(`[user] creado id=${user.id} username=${user.username} role=${user.role}`);
}

async function cmdPasswd(args: Parsed): Promise<void> {
  const [username, newPassword] = args.positional;
  if (!username || !newPassword) usage();
  const ok = await updatePassword(username, newPassword);
  if (!ok) {
    console.error(`[user] no encontrado: ${username}`);
    process.exit(1);
  }
  console.log(`[user] password actualizado: ${username}`);
}

async function cmdDelete(args: Parsed): Promise<void> {
  const [username] = args.positional;
  if (!username) usage();
  const ok = await deleteUser(username);
  if (!ok) {
    console.error(`[user] no encontrado: ${username}`);
    process.exit(1);
  }
  console.log(`[user] eliminado: ${username}`);
}

async function cmdList(): Promise<void> {
  const users = await listUsers();
  if (users.length === 0) {
    console.log('[user] no hay users');
    return;
  }
  console.log('ID\tROLE\tUSERNAME\tDISPLAY_NAME');
  for (const u of users) {
    console.log(`${u.id}\t${u.role}\t${u.username}\t${u.displayName ?? ''}`);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();
  const args = parseArgs(rest);
  switch (cmd) {
    case 'create': await cmdCreate(args); break;
    case 'passwd': await cmdPasswd(args); break;
    case 'delete': await cmdDelete(args); break;
    case 'list':   await cmdList(); break;
    default: usage();
  }
}

main()
  .catch((err) => {
    console.error('[user] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
