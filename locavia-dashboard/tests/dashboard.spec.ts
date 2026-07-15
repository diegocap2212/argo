import { expect, test } from '@playwright/test';

// O h1 da home é `Saúde da<br/><em>operação.</em>` → textContent "Saúde daoperação."
// (sem espaço por causa do <br/>, com ponto do <em>). O regex tolera o espaço opcional
// e o ponto para não quebrar quando a tipografia mudar.
const HOME_H1 = /Saúde da\s*operação/;

test.describe('Central de performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(HOME_H1, { timeout: 30_000 });
  });

  test('exibe resumo executivo e matriz dos times', async ({ page }) => {
    await expect(page.getByText('Panorama da torre')).toBeVisible();
    await expect(page.getByText('Entregas', { exact: true })).toBeVisible();
    await expect(page.getByText('WIP atual', { exact: true })).toBeVisible();
    await expect(page.getByText('Itens envelhecidos', { exact: true })).toBeVisible();
    await expect(page.getByText('Times em atenção', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entradas × saídas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saúde dos times' })).toBeVisible();
    const navigation = page.getByLabel('Navegação global');
    await expect(navigation.getByLabel('Guia')).toHaveCount(0);
    await expect(navigation.getByLabel('Admin')).toHaveCount(0);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  });

  test('altera o período de análise', async ({ page }) => {
    // O controle virou um <input type="range"> (aria-label "Período em semanas"),
    // não mais um <select>. Valor é em semanas (default 8).
    const period = page.getByLabel('Período em semanas');
    await expect(period).toHaveValue('8');
    await period.fill('5');
    await expect(period).toHaveValue('5');
  });

  test('navega da matriz para o detalhe do time', async ({ page }) => {
    await page.locator('tbody tr').first().click();
    await expect(page).toHaveURL(/\/time\//);
    // Aba padrão (Entrega) do detalhe do time.
    await expect(page.getByText('Entradas × saídas', { exact: true })).toBeVisible();
    await expect(page.getByText('CFD do time', { exact: true })).toBeVisible();
  });

  test('redireciona URLs antigas de release', async ({ page }) => {
    await page.goto('/release/O4R2');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('h1')).toContainText(HOME_H1);
  });
});

test.describe('Portfólio do agilista', () => {
  test('não oferece dimensão de release', async ({ page }) => {
    await page.goto('/sm/gabriela');
    await expect(page.locator('h1')).toContainText('Gabriela', { timeout: 30_000 });
    await expect(page.getByLabel('Time', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Período em semanas')).toBeVisible();
    await expect(page.getByText(/Todas as Releases|Release:/)).toHaveCount(0);
  });
});
