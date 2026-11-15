#!/usr/bin/env tsx
// Uso:
//   tsx cli/org.ts create <slug> <nombre...> [--domains=facu.edu.ar,otra.edu]
//   tsx cli/org.ts list
//   tsx cli/org.ts add-user <slug> <username> [--role=admin|member]
import { createOrg, listOrgs, requireOrg, addOrgMember } from '../src/lib/orgs.js';
import { findByUsername } from '../src/lib/users.js';
import { isSlug } from '../src/lib/storage.js';
import { closeDb } from '../src/lib/db.js';

function usage(): never {
  console.error('Uso:\n  tsx cli/org.ts create <slug> <nombre...> [--domains=a.edu,b.edu]\n  tsx cli/org.ts list\n  tsx cli/org.ts add-user <slug> <username> [--role=admin|member]');
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=', 2)));
  const positional = rest.filter((a) => !a.startsWith('--'));

  if (cmd === 'create') {
    const [slug, ...nameParts] = positional;
    if (!slug || !nameParts.length) usage();
    if (!isSlug(slug) || ['doc', 'source', 'project'].includes(slug)) {
      console.error(`[org] slug invalido: ${slug} (solo lowercase, numeros y guion; doc, source y project estan reservados)`);
      process.exit(1);
    }
    const domains = (flags['domains'] ?? '').split(',').map((d: string) => d.trim()).filter(Boolean);
    const org = await createOrg({ slug, name: nameParts.join(' '), allowedDomains: domains });
    console.log(`[org] creada id=${org.id} slug=${org.slug} dominios=${org.allowedDomains.join(',') || '(solo invitacion)'}`);
  } else if (cmd === 'add-user') {
    const [slug, username] = positional;
    const role = flags['role'] ?? 'member';
    if (!slug || !username || (role !== 'admin' && role !== 'member')) usage();
    const org = await requireOrg(slug);
    const user = await findByUsername(username);
    if (!user) {
      console.error(`[org] usuario no encontrado: ${username}`);
      process.exit(1);
    }
    await addOrgMember(org.id, user.id, role);
    console.log(`[org] ${username} agregado a ${org.slug} como ${role}`);
  } else if (cmd === 'list') {
    for (const o of await listOrgs()) console.log(`${o.id}\t${o.slug}\t${o.name}\t${o.allowedDomains.join(',')}`);
  } else {
    usage();
  }
}

main()
  .catch((err) => {
    console.error('[org] error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
