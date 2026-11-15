// Seeds the e2e database (run by global-setup with the e2e env, after the server migrated it).
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createOrg, addOrgMember, requireOrg } from '../src/lib/orgs.js';
import { createUser } from '../src/lib/users.js';
import { createTeam, addMember } from '../src/lib/teams.js';
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

const SAMPLE_MDX = `import Aviso from './Aviso'

# Clase 3: componentes

{/* nota para docentes: no se muestra */}
<div className="aviso">Traer la notebook cargada.</div>

Texto con **markdown** comun.

<form action="/api/push?scope=me" method="post"><input name="file" value="victima.md"><button>Enviar</button></form>

<style>.toolbar { display: none !important; }</style>
`;

// Reports what the page can reach: it runs sandboxed, so it must see no cookie and no API data.
const SAMPLE_HTML = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Simulador</title>
<style>body { font-family: sans-serif; padding: 24px; } h1 { color: #2563eb; }</style></head>
<body>
<h1>Simulador interactivo</h1>
<p id="cookie">cookie: ?</p>
<p id="api">api: esperando</p>
<script>
  var c = document.getElementById('cookie');
  try { c.textContent = 'cookie: ' + (document.cookie ? 'visible' : 'oculta'); }
  catch (e) { c.textContent = 'cookie: oculta'; }
  fetch('/api/docs?scope=me', { credentials: 'include' })
    .then(function (r) { return r.ok ? 'api: abierta' : 'api: rechazada'; })
    .catch(function () { return 'api: bloqueada'; })
    .then(function (t) { document.getElementById('api').textContent = t; });
</script>
</body>
</html>
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
  await createTeam(facuB.id, { slug: 'catedra', name: 'Catedra de Sistemas' });
  await addMember(facuB.id, 'catedra', BETO.user);
  await createUser({ username: LUZ.user, password: LUZ.pass }); // no organization on purpose

  const betoDir = join(orgDir('facu-b'), 'users', String(beto.id));
  await writeDoc(betoDir, 'programa.md', SAMPLE_DOC);
  await writeDoc(betoDir, 'clase.mdx', SAMPLE_MDX);
  await writeDoc(betoDir, 'simulador.html', SAMPLE_HTML);
  for (const f of ['editable.md', 'borrador.md', 'conflicto.md']) await writeDoc(betoDir, f, '# Apunte\n\nTexto original.\n');
  await writeDoc(join(orgDir('default'), 'public'), 'bienvenida.md', '# Bienvenida\n\nDocumento publico de la organizacion Default.\n');
}

main()
  .catch((err) => {
    console.error('[e2e seed]', err);
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
