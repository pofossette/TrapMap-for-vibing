// run with pnpm --filter @trapmap/web-panel test:e2e
import { expect, test } from '../helpers/fixtures.js';
import { AppShell } from '../page-objects/app-shell.js';
import { LoginPage } from '../page-objects/login-page.js';

test.describe('login page', () => {
  test('unauthenticated visiting / redirects to /login', async ({ page, mockApi }) => {
    await mockApi.mockUnauthorized();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful login with valid key via vCursor clicks', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockUnauthorized();
    const loginPage = new LoginPage(page, vCursor);
    await loginPage.goto();
    await expect(loginPage.accessKeyInput).toBeVisible();
    await loginPage.fillAccessKey('valid-access-key-12345');
    const signInButton = page.getByRole('button', { name: /登录|sign in/i }).first();
    await expect(signInButton).toBeEnabled();
    await mockApi.mockAllAuthenticated('administrator');
    await vCursor.click(signInButton);
    await expect(page).toHaveURL('/');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 10_000 });
  });

  test('invalid key shows error via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockUnauthorized();
    await mockApi.mockLogin();
    const loginPage = new LoginPage(page, vCursor);
    await loginPage.goto();
    await loginPage.fillAccessKey('short');
    const signInButton = page.getByRole('button', { name: /登录|sign in/i }).first();
    await expect(signInButton).toBeDisabled();
    await loginPage.fillAccessKey('invalid-key-1234567');
    await page.unroute('**/v1/auth/login').catch(() => {});
    await page.route('**/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'VALIDATION_ERROR',
          kind: 'validation',
          message: 'Invalid access key',
        }),
      });
    });
    await vCursor.click(signInButton);
    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('logout flow via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/');
    await page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    const shell = new AppShell(page, vCursor);
    await expect(shell.header).toBeVisible();
    await mockApi.mockUnauthorized();
    await mockApi.mockLogout();
    await vCursor.click(shell.userMenuTrigger);
    const logoutItem = page.getByRole('menuitem', { name: /安全退出|log out/i }).first();
    const fallback = page.getByText(/安全退出|log out/i).first();
    if ((await logoutItem.count()) > 0) {
      await vCursor.click(logoutItem);
    } else {
      await vCursor.click(fallback);
    }
    await expect(page).toHaveURL(/\/login/);
  });
});
