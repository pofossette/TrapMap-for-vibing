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

test.describe('role-aware navigation', () => {
  test('administrator sees /reviews via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/');
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    const shell = new AppShell(page, vCursor);
    await expect(shell.header).toBeVisible();
    const mobileBtn = getMobileMenuButton(page);
    if (await mobileBtn.isVisible().catch(() => false)) {
      await vCursor.click(mobileBtn);
      await page.waitForTimeout(800).catch(() => {});
    }
    const reviewsLink = await getVisibleNavLink(page, '/reviews');
    await expect(reviewsLink).toBeVisible();
    await vCursor.click(reviewsLink);
    await expect(page).toHaveURL(/\/reviews/);
  });

  test('reviewer sees /reviews via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('reviewer');
    await page.goto('/');
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    const shell = new AppShell(page, vCursor);
    await expect(shell.header).toBeVisible();
    const mobileBtn = getMobileMenuButton(page);
    if (await mobileBtn.isVisible().catch(() => false)) {
      await vCursor.click(mobileBtn);
      await page.waitForTimeout(800).catch(() => {});
    }
    const reviewsLink = await getVisibleNavLink(page, '/reviews');
    await expect(reviewsLink).toBeVisible();
    await vCursor.click(reviewsLink);
    await expect(page).toHaveURL(/\/reviews/);
  });

  test('read-only-operator does not see /reviews and action bar disabled via vCursor', async ({
    page,
    mockApi,
    vCursor,
  }) => {
    await mockApi.mockAllAuthenticated('read-only-operator');
    await page.goto('/');
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    const shell = new AppShell(page, vCursor);
    await expect(shell.header).toBeVisible();
    const mobileBtn = getMobileMenuButton(page);
    if (await mobileBtn.isVisible().catch(() => false)) {
      await vCursor.click(mobileBtn);
      await page.waitForTimeout(800).catch(() => {});
    }
    const artifactsLink = await getVisibleNavLink(page, '/artifacts');
    await expect(artifactsLink).toBeVisible();
    await expect(page.locator('a[href="/reviews"]')).toHaveCount(0);
    await page.goto('/reviews/rev-201');
    await page.waitForLoadState('networkidle').catch(() => {});
    const approveButton = page.getByRole('button', { name: /批准|approve/i }).first();
    const rejectButton = page.getByRole('button', { name: /拒绝|reject/i }).first();
    const returnButton = page.getByRole('button', { name: /退回|return/i }).first();
    if ((await approveButton.count()) > 0) {
      await expect(approveButton).toBeDisabled();
      await vCursor.moveTo(approveButton);
    }
    if ((await rejectButton.count()) > 0) {
      await expect(rejectButton).toBeDisabled();
    }
    if ((await returnButton.count()) > 0) {
      await expect(returnButton).toBeDisabled();
    }
    await expect(page.getByText(/无权|no permission/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
