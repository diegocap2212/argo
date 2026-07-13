import { expect, test } from '@playwright/test';

test.describe('Central de performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Saúde da operação', { timeout: 30_000 });
  });

  test('exibe resumo executivo e matriz dos times', async ({ page }) => {
    await expect(page.getByText('Entregas', { exact: true })).toBeVisible();
    await expect(page.getByText('WIP atual', { exact: true })).toBeVisible();
    await expect(page.getByText('Saldo de fluxo', { exact: true })).toBeVisible();
    await expect(page.getByText('Matriz de saúde dos times')).toBeVisible();
    await expect(page.getByText('Fluxo acumulado da torre')).toBeVisible();
    await expect(page.getByText('Entradas × saídas')).toBeVisible();
    await expect(page.getByText('Times: vazão × Lead Time')).toBeVisible();
    await expect(page.getByText('Cycle Time P85', { exact: true })).toBeVisible();
    await expect(page.getByText('Aging do WIP', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Jornada de contexto')).toContainText('Torre');
    const navigation = page.getByLabel('Navegação global');
    await expect(navigation.getByLabel('Guia')).toHaveCount(0);
    await expect(navigation.getByLabel('Admin')).toHaveCount(0);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  });

  test('altera o período de análise', async ({ page }) => {
    const period = page.getByLabel('Período de análise');
    await expect(period).toHaveValue('8');
    await period.selectOption('5');
    await expect(period).toHaveValue('5');
  });

  test('navega da matriz para o detalhe do time', async ({ page }) => {
    await page.locator('tbody tr').first().click();
    await expect(page).toHaveURL(/\/time\//);
    await expect(page.getByText('Entradas e saídas', { exact: true })).toBeVisible();
    await expect(page.getByText('Evolução do Lead Time P85')).toBeVisible();
  });

  test('redireciona URLs antigas de release', async ({ page }) => {
    await page.goto('/release/O4R2');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('h1')).toContainText('Saúde da operação');
  });
});

test.describe('Portfólio do agilista', () => {
  test('não oferece dimensão de release', async ({ page }) => {
    await page.goto('/sm/gabriela');
    await expect(page.locator('h1')).toContainText('Gabriela', { timeout: 30_000 });
    await expect(page.getByLabel('Time')).toBeVisible();
    await expect(page.getByLabel('Período')).toBeVisible();
    await expect(page.getByText('Times do portfólio')).toBeVisible();
    await expect(page.getByText('CFD do portfólio')).toBeVisible();
    await expect(page.getByText('Cycle Time P85', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Jornada de contexto')).toContainText('Gabriela');
    await expect(page.getByText(/Todas as Releases|Release:/)).toHaveCount(0);
  });
});
