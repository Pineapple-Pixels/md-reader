import { test, expect, type Page } from '@playwright/test';
import { ADMIN, BETO, LUZ } from './env';

type Creds = { user: string; pass: string };

async function login(page: Page, creds: Creds, org?: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(creds.user);
  await page.getByLabel('Contrasena').fill(creds.pass);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/me$/);
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

  await page.getByLabel('Tema de la app').selectOption('black-violet');

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
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
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

  await page.getByRole('button', { name: 'Salir' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).not.toHaveClass(/themed/);
});
