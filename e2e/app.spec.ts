import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { ADMIN, BETO, LUZ } from './env';

type Creds = { user: string; pass: string };

// The server allows 10 logins per 15 minutes: each user signs in through the form once, later tests reuse the session.
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();

async function login(page: Page, creds: Creds, org?: string): Promise<void> {
  const saved = sessions.get(creds.user);
  if (saved) {
    await page.context().addCookies(saved);
    await page.goto('/me');
  } else {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill(creds.user);
    await page.getByLabel('Contrasena').fill(creds.pass);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/me$/);
    sessions.set(creds.user, await page.context().cookies());
  }
  if (org) {
    // Tests must not depend on which org a previous test left as "last used".
    expect((await page.request.post('/api/auth/switch-org', { data: { slug: org } })).ok()).toBe(true);
  }
}

async function useTheme(page: Page, id: string): Promise<void> {
  expect((await page.request.put('/api/me/active-theme', { data: { id } })).ok()).toBe(true);
}

async function openDoc(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.doc-sheet .doc h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('should log in on the first attempt and land in the organization', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveScreenshot('login.png');

  await login(page, ADMIN);

  await expect(page.getByText('Default · Mis docs')).toBeVisible();
});

test('should leave the document pixel-identical when the app theme changes', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await openDoc(page, '/me/doc/programa.md');
  const box = (await page.locator('.doc-sheet').boundingBox())!;
  // Inside the sheet's rounded border (its anti-aliased edge blends with the app background).
  const inset = 20;
  const clip = { x: box.x + inset, y: box.y + inset, width: box.width - 2 * inset, height: box.height - 2 * inset };
  // Comment and copy buttons are app controls drawn over the document, not document content.
  const mask = [page.locator('.doc-comment-add, .doc-comment-indicator, .copy-btn')];
  const before = await page.screenshot({ clip, mask });

  await page.getByRole('button', { name: 'Menu de usuario' }).click();
  await page.getByLabel('Tema de la app').selectOption('black-violet');
  await page.keyboard.press('Escape');

  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 10, 16)');
  expect((await page.screenshot({ clip, mask })).equals(before)).toBe(true);
  await expect(page).toHaveScreenshot('doc-tema-negro-violeta.png');
});

test('should render each document with the design of its own organization', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');

  await openDoc(page, '/me/doc/programa.md');
  await expect(page.locator('.doc-sheet')).toHaveCSS('background-color', 'rgb(251, 247, 239)');
  await expect(page.locator('.doc-brand')).toHaveText('Facultad B');
  await expect(page).toHaveScreenshot('doc-facultad-b.png');

  await openDoc(page, '/pub/default/doc/bienvenida.md');
  await expect(page.locator('.doc-sheet')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.doc-brand')).toHaveText('Default');
});

test('should preview design changes live in the admin Diseno tab', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Diseno' }).click();
  await expect(page.getByText('Vista previa')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('admin-diseno.png', { fullPage: true });

  await page.getByLabel('Links').fill('#00aa00');

  await expect(page.locator('.doc-sheet .doc a').first()).toHaveCSS('color', 'rgb(0, 170, 0)');
});

test('should list preset themes in Perfil > Apariencia', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await page.goto('/profile');

  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Apariencia' }) });

  await expect(section.getByText('Negro y violeta')).toBeVisible();
  await expect(section).toHaveScreenshot('apariencia.png');
});

test('should switch organization from the scope menu', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await page.goto('/me');
  await page.getByText('Facultad B · Mis docs').click();

  await page.getByRole('menuitem', { name: 'Cambiar a Default' }).click();

  await expect(page.getByText('Default · Mis docs')).toBeVisible();
  await page.getByRole('button', { name: 'Menu de usuario' }).click();
  await expect(page.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Administración' })).toHaveCount(0);
});

test('should explain how to get in to an account without organization', async ({ page }) => {
  await login(page, LUZ);

  await expect(page.getByText('todavia no perteneces a ninguna organizacion')).toBeVisible();
  expect((await page.request.get('/api/docs?scope=me')).status()).toBe(403);
  await expect(page).toHaveScreenshot('sin-organizacion.png');
});

test('should not leave the app theme behind after logging out', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'black-violet');
  await page.goto('/me');
  await expect(page.locator('html')).toHaveClass(/themed/);

  await page.getByRole('button', { name: 'Menu de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesion' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).not.toHaveClass(/themed/);
});

// ---------- Editing: only after Editar, nothing reaches the server until Guardar ----------

async function serverContent(page: Page, file: string): Promise<string> {
  const res = await page.request.get(`/api/pull?scope=me&file=${encodeURIComponent(file)}`);
  return ((await res.json()) as { content: string }).content;
}

test('should change a document only after Editar and Guardar, and keep the old text in Historial', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await openDoc(page, '/me/doc/editable.md');
  await expect(page.getByLabel('Contenido del documento')).toHaveCount(0);

  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByLabel('Contenido del documento').fill('# Apunte\n\nTexto corregido.\n');
  await expect(page.getByRole('status')).toHaveText('Cambios sin guardar');
  await page.waitForTimeout(2500); // longer than the old 2 s autosave: nothing may be sent on its own
  expect(await serverContent(page, 'editable.md')).toBe('# Apunte\n\nTexto original.\n');

  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByRole('status')).toHaveText('Guardado');
  expect(await serverContent(page, 'editable.md')).toBe('# Apunte\n\nTexto corregido.\n');

  await page.getByRole('button', { name: 'Volver al documento' }).click();
  await page.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByRole('list', { name: 'Versiones' }).getByRole('button')).toHaveCount(1);
  await expect(page.locator('.history-preview .doc')).toContainText('Texto original.');
  // The version list shows when it was saved: masked so the capture does not depend on the clock.
  await expect(page).toHaveScreenshot('historial.png', { mask: [page.getByRole('list', { name: 'Versiones' })] });
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Restaurar esta version' }).click();
  await expect(page.getByRole('list', { name: 'Versiones' }).getByRole('button')).toHaveCount(2);
  expect(await serverContent(page, 'editable.md')).toBe('# Apunte\n\nTexto original.\n');
});

test('should offer the unsaved draft back after the tab is reloaded', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await page.goto('/me/edit/borrador.md');
  await page.getByLabel('Contenido del documento').fill('# Apunte\n\nBorrador sin guardar.\n');
  const dialogs: string[] = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); void d.accept(); });

  await page.reload();

  expect(dialogs).toEqual(['beforeunload']);
  await expect(page.getByRole('alert')).toContainText('borrador sin guardar');
  await expect(page.getByLabel('Contenido del documento')).toHaveValue('# Apunte\n\nTexto original.\n');
  await expect(page.getByLabel('Contenido del documento')).not.toBeEditable();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByLabel('Contenido del documento')).toHaveValue('# Apunte\n\nBorrador sin guardar.\n');
  await expect(page.getByLabel('Contenido del documento')).toBeEditable();
  expect(await serverContent(page, 'borrador.md')).toBe('# Apunte\n\nTexto original.\n');
});

test('should keep the draft when leaving the editor right after typing', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await page.goto('/me/edit/borrador.md');
  await page.getByLabel('Contenido del documento').fill('# Apunte\n\nEscrito y me fui.\n');

  await page.locator('aside').getByText('programa', { exact: true }).click();
  await expect(page).toHaveURL(/\/me\/doc\/programa\.md$/);
  await page.goto('/me/edit/borrador.md');

  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByLabel('Contenido del documento')).toHaveValue('# Apunte\n\nEscrito y me fui.\n');
});

test('should keep my text when someone else saved first, and let me choose', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await page.goto('/me/edit/conflicto.md');
  await page.getByLabel('Contenido del documento').fill('# Apunte\n\nMi version.\n');
  const { hash } = (await (await page.request.get('/api/pull?scope=me&file=conflicto.md')).json()) as { hash: string };
  expect((await page.request.post('/api/save?scope=me', { data: { file: 'conflicto.md', content: '# Apunte\n\nLa del otro.\n', baseHash: hash } })).ok()).toBe(true);

  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByRole('alert')).toContainText('Alguien guardo otra version');
  await expect(page.getByLabel('Contenido del documento')).toHaveValue('# Apunte\n\nMi version.\n');
  // The sidebar order depends on whether the list refetched after the other save: masked so the capture is stable.
  await expect(page).toHaveScreenshot('editor-conflicto.png', { mask: [page.locator('aside')] });
  await page.getByRole('button', { name: /Guardar igual/ }).click();
  await expect(page.getByRole('status')).toHaveText('Guardado');
  expect(await serverContent(page, 'conflicto.md')).toBe('# Apunte\n\nMi version.\n');
});

// ---------- MDX and HTML documents ----------

test('should render MDX as a document without its imports or JSX comments', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');

  await openDoc(page, '/me/doc/clase.mdx');

  await expect(page.locator('.doc .aviso')).toHaveText('Traer la notebook cargada.');
  await expect(page.locator('.doc')).not.toContainText('import');
  await expect(page.locator('.doc')).not.toContainText('nota para docentes');
  // Raw HTML that would act as the viewer (forms) or restyle the app (<style>) is removed.
  await expect(page.locator('.doc form, .doc input, .doc style, .doc button:not(.doc-comment-add):not(.copy-btn)')).toHaveCount(0);
  await expect(page.locator('.toolbar')).toBeVisible();

  await page.locator('.doc h1').click();

  await expect(page.getByText('Comentarios (linea 3)')).toBeVisible();
});

test('should run HTML documents sandboxed, without the viewer cookie or the API', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await page.goto('/me/doc/simulador.html');
  const frame = page.frameLocator('iframe.html-frame');

  await expect(frame.getByRole('heading', { name: 'Simulador interactivo' })).toBeVisible();
  await expect(frame.locator('#cookie')).toHaveText('cookie: oculta');
  await expect(frame.locator('#api')).not.toHaveText('api: esperando');
  await expect(frame.locator('#api')).not.toHaveText('api: abierta');
  // Earlier tests edit docs, so the sidebar order depends on timing: masked so the capture is stable.
  await expect(page).toHaveScreenshot('doc-html.png', { mask: [page.locator('aside')] });
});

// ---------- Export ----------

test('should download the document as Word', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await openDoc(page, '/me/doc/programa.md');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click().then(() => page.getByRole('menuitem', { name: 'Word' }).click())]);

  expect(download.suggestedFilename()).toBe('programa.docx');
  const head = Buffer.alloc(2);
  const fs = await import('fs/promises');
  const fh = await fs.open((await download.path())!);
  await fh.read(head, 0, 2, 0);
  await fh.close();
  expect(head.toString()).toBe('PK');
});

test('should print only the document sheet with the organization design', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'black-violet');
  await openDoc(page, '/me/doc/programa.md');

  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('.toolbar')).toBeHidden();
  await expect(page.locator('.doc-sheet')).toHaveCSS('background-color', 'rgb(251, 247, 239)');
  await expect(page).toHaveScreenshot('doc-impresion.png', { fullPage: true });
});

// ---------- Copy to another team ----------

test('should copy a document to a team and show where it came from', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await openDoc(page, '/me/doc/programa.md');

  await page.getByRole('button', { name: 'Compartir' }).click();
  await page.getByRole('menuitem', { name: 'Copiar a equipo' }).click();
  await expect(page.getByRole('combobox', { name: 'Copiar a' })).toHaveValue('catedra');
  await page.getByRole('dialog', { name: 'Copiar a equipo' }).getByRole('button', { name: 'Copiar' }).click();
  await expect(page.getByText('Copiado a Catedra de Sistemas')).toBeVisible();

  await openDoc(page, '/t/catedra/doc/programa.md');
  await expect(page.locator('.doc-origin')).toContainText('Copiado de Documentos de beto por beto');
});

// ---------- Reading layout ----------

test('should hide the sidebar on desktop and keep it hidden after a reload', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  await openDoc(page, '/me/doc/programa.md');
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toContainText('docs/programa');

  await page.getByRole('button', { name: 'Mostrar u ocultar menu lateral' }).click();

  await expect(page.locator('aside')).toBeHidden();
  await page.reload();
  await expect(page.locator('.doc-sheet .doc h1')).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar u ocultar menu lateral' }).click();
  await expect(page.locator('aside')).toBeVisible();
});

// ---------- Archive ----------

test('should archive a document and bring it back from Archivados', async ({ page }) => {
  await login(page, BETO, 'facu-b');
  await useTheme(page, 'light');
  const file = 'para-archivar.md';
  expect((await page.request.post('/api/push?scope=me', { data: { file, content: '# Para archivar\n' } })).ok()).toBe(true);
  try {
    await openDoc(page, `/me/doc/${file}`);

    await page.getByRole('button', { name: 'Archivar', exact: true }).click();

    await expect(page).toHaveURL(/\/me$/);
    await expect(page.locator('aside').getByText('para-archivar', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: /Archivados \(1\)/ }).click();
    await expect(page.getByRole('heading', { name: 'Archivados' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.toast')).toHaveCount(0);
    // Masked: the sidebar order depends on refetch timing and the date is today's.
    const mask = [page.locator('aside'), page.locator('[class*="index-meta"]')];
    await expect(page).toHaveScreenshot('archivados.png', { mask });

    await page.getByRole('button', { name: 'Restaurar', exact: true }).click();

    await expect(page.getByText('No hay nada archivado.')).toBeVisible();
    await expect(page.locator('aside').getByText('para-archivar', { exact: true }).first()).toBeVisible();
  } finally {
    await page.request.delete('/api/delete?scope=me', { data: { file } });
  }
});
