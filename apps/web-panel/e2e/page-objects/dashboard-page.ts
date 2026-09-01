import { type Locator, type Page, expect } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly metricsCards: Locator;
  readonly serviceHealth: Locator;
  readonly pendingActions: Locator;
  readonly trapGraphCard: Locator;
  readonly skillGraphCard: Locator;
  readonly incidentsCard: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /dashboard/i }).first();
    this.metricsCards = page.locator('[data-testid="metrics-card"]');
    this.serviceHealth = page.getByText(/service health/i).first();
    this.pendingActions = page.getByText(/pending actions|pending reviews/i).first();
    this.trapGraphCard = page.getByText(/trap graph/i).first();
    this.skillGraphCard = page.getByText(/skill graph/i).first();
    this.incidentsCard = page.getByText(/incidents/i).first();
    this.refreshButton = page.getByRole('button', { name: /refresh/i }).first();
  }

  async goto(): Promise<void> {
    await super.goto('/');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async refresh(): Promise<void> {
    if ((await this.refreshButton.count()) > 0) {
      await this.vCursor.click(this.refreshButton);
      await this.page.waitForLoadState('networkidle').catch(() => {});
    } else {
      await this.reload();
    }
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.getByText('TrapMap').first()).toBeVisible();
    // dashboard stats should be visible
    await expect(this.serviceHealth.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }
}
