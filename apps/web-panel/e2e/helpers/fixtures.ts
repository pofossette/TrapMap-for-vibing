import { type Page, test as base, expect } from '@playwright/test';

import { ActivityPage } from '../page-objects/activity-page.js';
import { AppShell } from '../page-objects/app-shell.js';
import { ArtifactPage } from '../page-objects/artifact-page.js';
import { DashboardPage } from '../page-objects/dashboard-page.js';
import { LoginPage } from '../page-objects/login-page.js';
import { ReviewQueuePage } from '../page-objects/review-queue-page.js';
import { SkillGraphPage } from '../page-objects/skill-graph-page.js';
import { TrapGraphPage } from '../page-objects/trap-graph-page.js';
import { MockApi, type MockRole } from './mock-api.js';
import { VCursor } from './v-cursor.js';

export type Fixtures = {
  mockApi: MockApi;
  vCursor: VCursor;
  authenticatedPage: Page;
  loginPage: LoginPage;
  appShell: AppShell;
  reviewQueuePage: ReviewQueuePage;
  artifactPage: ArtifactPage;
  dashboardPage: DashboardPage;
  trapGraphPage: TrapGraphPage;
  skillGraphPage: SkillGraphPage;
  activityPage: ActivityPage;
};

// High-parallel custom fixtures: each test gets isolated page, mockApi and vCursor.
// Run with: pnpm --filter @trapmap/web-panel test:e2e
export const test = base.extend<Fixtures>({
  mockApi: async ({ page }, use) => {
    const api = new MockApi(page);
    await use(api);
    await api.clearMocks().catch(() => {});
  },

  vCursor: async ({ page }, use) => {
    const cursor = new VCursor(page);
    await cursor.init().catch(() => {});
    await use(cursor);
  },

  authenticatedPage: async ({ page, mockApi }, use) => {
    // Preset authenticated session for high-parallel isolation; each worker gets its own page.
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    // Wait for shell branding; do not fail test if still loading
    await page.waitForSelector('text=TrapMap', { timeout: 5000 }).catch(() => {});
    await use(page);
  },

  loginPage: async ({ page, vCursor }, use) => {
    const lp = new LoginPage(page, vCursor);
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await use(lp);
  },

  appShell: async ({ page, vCursor }, use) => {
    const shell = new AppShell(page, vCursor);
    await use(shell);
  },

  reviewQueuePage: async ({ page, vCursor }, use) => {
    const p = new ReviewQueuePage(page, vCursor);
    await use(p);
  },

  artifactPage: async ({ page, vCursor }, use) => {
    const p = new ArtifactPage(page, vCursor);
    await use(p);
  },

  dashboardPage: async ({ page, vCursor }, use) => {
    const p = new DashboardPage(page, vCursor);
    await use(p);
  },

  trapGraphPage: async ({ page, vCursor }, use) => {
    const p = new TrapGraphPage(page, vCursor);
    await use(p);
  },

  skillGraphPage: async ({ page, vCursor }, use) => {
    const p = new SkillGraphPage(page, vCursor);
    await use(p);
  },

  activityPage: async ({ page, vCursor }, use) => {
    const p = new ActivityPage(page, vCursor);
    await use(p);
  },
});

export { expect };

// Helper to create an authenticated page for a specific role without duplicating fixture.
// Usage: await mockApi.mockSession('reviewer'); await page.goto('/');
// Prefer `authenticatedPage` fixture for default administrator; use this helper for reviewer/read-only-operator matrices.
// For unauthenticated matrix use mockApi.mockUnauthorized() then page.goto('/login').
export async function gotoWithRole(
  page: Page,
  mockApi: MockApi,
  role: MockRole,
  path = '/',
): Promise<void> {
  if (role === 'unauthenticated') {
    await mockApi.mockUnauthorized();
  } else {
    await mockApi.mockAllAuthenticated(role);
  }
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}
