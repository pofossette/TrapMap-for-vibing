import { type Locator, type Page, expect } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class ReviewQueuePage extends BasePage {
  readonly heading: Locator;
  readonly statusFilter: Locator;
  readonly riskFilter: Locator;
  readonly sourceInput: Locator;
  readonly sortFilter: Locator;
  readonly searchInput: Locator;
  readonly reviewItems: Locator;
  readonly emptyState: Locator;
  readonly skeleton: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly errorPanel: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /review queue/i }).first();
    // FilterToolbar contains FilterSelect components; use role combobox fallback to select
    this.statusFilter = page.locator('select').first();
    this.riskFilter = page.locator('select').nth(1);
    this.sourceInput = page.getByPlaceholder(/all sources/i).first();
    this.sortFilter = page.locator('select').last();
    this.searchInput = page.getByPlaceholder(/search/i).first();
    this.reviewItems = page.locator('article');
    this.emptyState = page.getByText(/no reviews|no matching reviews/i).first();
    this.skeleton = page.locator('[data-testid="skeleton"]').first();
    this.nextButton = page.getByRole('button', { name: /next/i }).last();
    this.prevButton = page.getByRole('button', { name: /previous/i }).first();
    this.errorPanel = page.locator('text=Failed').first();
  }

  async goto(): Promise<void> {
    await super.goto('/reviews');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    // either items or empty state should appear
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async filterByStatus(value: string): Promise<void> {
    if ((await this.statusFilter.count()) > 0) {
      await this.statusFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.statusFilter);
        const option = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await option.count()) > 0) {
          await this.vCursor.click(option);
        }
      });
    }
  }

  async filterByRisk(value: string): Promise<void> {
    if ((await this.riskFilter.count()) > 0) {
      await this.riskFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.riskFilter);
        const option = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await option.count()) > 0) {
          await this.vCursor.click(option);
        }
      });
    }
  }

  async search(value: string): Promise<void> {
    await this.searchInput.fill(value);
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
  }

  async expectItemsCount(count: number): Promise<void> {
    await expect(this.reviewItems).toHaveCount(count);
  }

  async expectAtLeastOneItem(): Promise<void> {
    await expect(this.reviewItems.first()).toBeVisible({ timeout: 10_000 });
  }

  async expectEmpty(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  async clickFirstItem(): Promise<void> {
    await this.vCursor.click(
      this.reviewItems
        .first()
        .getByRole('link', { name: /view details/i })
        .first(),
    );
  }

  async goNext(): Promise<void> {
    await this.vCursor.click(this.nextButton);
  }

  async goPrev(): Promise<void> {
    await this.vCursor.click(this.prevButton);
  }
}
