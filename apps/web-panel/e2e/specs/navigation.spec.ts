// run with pnpm --filter @trapmap/web-panel test:e2e
import { expect, test } from '../helpers/fixtures.js';
import { AppShell } from '../page-objects/app-shell.js';

async function getVisibleNavLink(page: import('@playwright/test').Page, href: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const loc = page.locator(`a[href="${href}"]`);
    const count = await loc.count();
    for (let i = 0; i < count; i += 1) {
      if (
        await loc
          .nth(i)
          .isVisible()
          .catch(() => false)
      ) {
        return loc.nth(i);
      }
    }
    await page.waitForTimeout(150).catch(() => {});
  }
  return page.locator(`a[href="${href}"]`).first();
}

function getMobileMenuButton(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: /open menu|close menu|打开菜单|关闭菜单/i }).first();
}

test.describe('authenticated navigation', () => {
  test('navigates to all 7 routes via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/');
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    const shell = new AppShell(page, vCursor);
    await expect(shell.header).toBeVisible();
    await expect(page).toHaveURL('/');
    const clickNav = async (href: string) => {
      const mobileBtn = getMobileMenuButton(page);
      if (await mobileBtn.isVisible().catch(() => false)) {
        await vCursor.click(mobileBtn);
        await page.waitForTimeout(800).catch(() => {});
      }
      const link = await getVisibleNavLink(page, href);
      await expect(link).toBeVisible({ timeout: 10_000 });
      await vCursor.click(link);
    };
    await clickNav('/reviews');
    await expect(page).toHaveURL(/\/reviews/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await clickNav('/artifacts');
    await expect(page).toHaveURL(/\/artifacts/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await clickNav('/trap-graph');
    await expect(page).toHaveURL(/\/trap-graph/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await clickNav('/skill-graph');
    await expect(page).toHaveURL(/\/skill-graph/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await clickNav('/activity');
    await expect(page).toHaveURL(/\/activity/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.goto('/reviews/rev-201');
    await expect(page).toHaveURL(/\/reviews\/rev-201/);
  });

  test('back and forward navigation works via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/');
    const shell = new AppShell(page, vCursor);
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    await expect(shell.header).toBeVisible();
    const clickNav = async (href: string) => {
      const mobileBtn = getMobileMenuButton(page);
      if (await mobileBtn.isVisible().catch(() => false)) {
        await vCursor.click(mobileBtn);
        await page.waitForTimeout(800).catch(() => {});
      }
      const link = await getVisibleNavLink(page, href);
      await expect(link).toBeVisible({ timeout: 10_000 });
      await vCursor.click(link);
    };
    await clickNav('/reviews');
    await expect(page).toHaveURL(/\/reviews/);
    await clickNav('/artifacts');
    await expect(page).toHaveURL(/\/artifacts/);
    await page.goBack();
    await expect(page).toHaveURL(/\/reviews/);
    await page.goForward();
    await expect(page).toHaveURL(/\/artifacts/);
  });

  test('unknown route redirects to /', async ({ page, mockApi }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/unknown-route-xyz');
    await expect(page).toHaveURL('/');
  });
});
