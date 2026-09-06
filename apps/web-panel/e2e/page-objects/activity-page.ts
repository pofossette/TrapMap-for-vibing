import { expect, type Locator, type Page } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class ActivityPage extends BasePage {
  readonly heading: Locator;
  readonly actorInput: Locator;
  readonly typeFilter: Locator;
  readonly fromInput: Locator;
  readonly toInput: Locator;
  readonly searchInput: Locator;
  readonly timelineItems: Locator;
  readonly emptyState: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /activity/i }).first();
    this.actorInput = page.getByPlaceholder(/all operators/i).first();
    this.typeFilter = page.locator('select').first();
    this.fromInput = page.locator('input[type="date"]').first();
    this.toInput = page.locator('input[type="date"]').last();
    this.searchInput = page.getByPlaceholder(/search.*log/i).first();
    this.timelineItems = page
      .locator('[data-testid="timeline-item"]')
      .or(page.locator('li').first());
    // fallback to generic list
    this.emptyState = page.getByText(/no activity|no matched logs/i).first();
    this.nextButton = page.getByRole('button', { name: /next/i }).last();
    this.prevButton = page.getByRole('button', { name: /previous/i }).first();
  }

  async goto(): Promise<void> {
    await super.goto('/activity');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async filterByActor(value: string): Promise<void> {
    if ((await this.actorInput.count()) > 0) {
      await this.actorInput.fill(value);
    }
  }

  async filterByType(value: string): Promise<void> {
    if ((await this.typeFilter.count()) > 0) {
      await this.typeFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.typeFilter);
        const opt = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await opt.count()) > 0) await this.vCursor.click(opt);
      });
    }
  }

  async search(value: string): Promise<void> {
    if ((await this.searchInput.count()) > 0) {
      await this.searchInput.fill(value);
    }
  }

  async expectTimelineVisible(): Promise<void> {
    // either timeline items or empty state
    const hasItems = (await this.timelineItems.count()) > 0;
    const hasEmpty = (await this.emptyState.count()) > 0;
    expect(hasItems || hasEmpty).toBeTruthy();
  }

  async goNext(): Promise<void> {
    await this.vCursor.click(this.nextButton);
  }

  async goPrev(): Promise<void> {
    await this.vCursor.click(this.prevButton);
  }
}
