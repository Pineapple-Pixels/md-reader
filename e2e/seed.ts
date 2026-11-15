// Seeds the e2e database (run by global-setup with the e2e env, after the server migrated it).
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createOrg, addOrgMember, requireOrg } from '../src/lib/orgs.js';
import { createUser } from '../src/lib/users.js';
import { saveOrgBrand } from '../src/lib/design.js';
import { orgDir } from '../src/lib/storage.js';
import { closeDb } from '../src/lib/db.js';
import { DEFAULT_DESIGN } from '../shared/design.js';
import { BETO, LUZ } from './env.js';

const SAMPLE_DOC = `# Programa de la materia

Bienvenidos al programa de **Diseno de Sistemas**. La bibliografia esta en [el campus](https://example.com).

## Cronograma

| Semana | Tema | Entrega |
|---|---|---|
| 1 | Introduccion | - |
| 2 | Modelado de datos | TP 1 |

> La asistencia minima es del 75% de las clases practicas.

\`\`\`js
const nota = (tp1 + tp2) / 2;
\`\`\`
`;

async function writeDoc(dir: string, file: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), content);
}

async function main(): Promise<void> {
  const def = await requireOrg('default');
  const facuB = await createOrg({ slug: 'facu-b', name: 'Facultad B' });
  // Bundled fonts only, so screenshots never depend on Google Fonts being reachable.
  await saveOrgBrand(facuB.id, 'Facultad B', {
    ...DEFAULT_DESIGN,
    colors: { ...DEFAULT_DESIGN.colors, bg: '#fbf7ef', heading: '#1b3a5c', link: '#c0392b', quote: '#c0392b' },
    fonts: { body: 'dm-sans', heading: 'space-grotesk', mono: 'jetbrains-mono' },
    radius: 'lg',
  });

  const beto = await createUser({ username: BETO.user, password: BETO.pass });
  await addOrgMember(facuB.id, beto.id, 'admin');
  await addOrgMember(def.id, beto.id, 'member');
  await createUser({ username: LUZ.user, password: LUZ.pass }); // no organization on purpose

  await writeDoc(join(orgDir('facu-b'), 'users', String(beto.id)), 'programa.md', SAMPLE_DOC);
  await writeDoc(join(orgDir('default'), 'public'), 'bienvenida.md', '# Bienvenida\n\nDocumento publico de la organizacion Default.\n');
}

main()
  .catch((err) => {
    console.error('[e2e seed]', err);
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
