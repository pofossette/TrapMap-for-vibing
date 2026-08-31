import { type Locator, type Page, expect } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class ArtifactPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly lifecycleFilter: Locator;
  readonly scopeFilter: Locator;
  readonly levelFilter: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly emptyState: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly detailDrawer: Locator;
  readonly detailCloseButton: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /artifacts/i }).first();
    this.searchInput = page.getByPlaceholder(/search.*artifact/i).first();
    this.lifecycleFilter = page.locator('select').first();
    this.scopeFilter = page.locator('select').nth(1);
    this.levelFilter = page.locator('select').nth(2);
    this.table = page.locator('table');
    this.rows = page.locator('tbody tr');
    this.emptyState = page.getByText(/no governed artifacts|no artifacts/i).first();
    this.nextButton = page.getByRole('button', { name: /next/i }).last();
    this.prevButton = page.getByRole('button', { name: /previous/i }).first();
    this.detailDrawer = page.locator('text=Artifact details').first();
    this.detailCloseButton = page.getByRole('button', { name: /close/i }).first();
  }

  async goto(): Promise<void> {
    await super.goto('/artifacts');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    // table or empty or heading
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async search(value: string): Promise<void> {
    await this.searchInput.fill(value);
  }

  async filterLifecycle(value: string): Promise<void> {
    if ((await this.lifecycleFilter.count()) > 0) {
      await this.lifecycleFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.lifecycleFilter);
        const opt = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await opt.count()) > 0) await this.vCursor.click(opt);
      });
    }
  }

  async filterScope(value: string): Promise<void> {
    if ((await this.scopeFilter.count()) > 0) {
      await this.scopeFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.scopeFilter);
        const opt = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await opt.count()) > 0) await this.vCursor.click(opt);
      });
    }
  }

  async filterLevel(value: string): Promise<void> {
    if ((await this.levelFilter.count()) > 0) {
      await this.levelFilter.selectOption(value).catch(async () => {
        await this.vCursor.click(this.levelFilter);
        const opt = this.page.getByRole('option', { name: new RegExp(value, 'i') }).first();
        if ((await opt.count()) > 0) await this.vCursor.click(opt);
      });
    }
  }

  async expectRowsCount(count: number): Promise<void> {
    await expect(this.rows).toHaveCount(count);
  }

  async expectAtLeastOneRow(): Promise<void> {
    await expect(this.rows.first()).toBeVisible({ timeout: 10_000 });
  }

  async expectEmpty(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  async openFirstArtifact(): Promise<void> {
    const firstLink = this.rows.first().getByRole('button').first();
    if ((await firstLink.count()) > 0) {
      await this.vCursor.click(firstLink);
    } else {
      await this.vCursor.click(this.rows.first());
    }
  }

  async closeDrawer(): Promise<void> {
    if ((await this.detailCloseButton.count()) > 0) {
      await this.vCursor.click(this.detailCloseButton);
    }
  }

  async goNext(): Promise<void> {
    await this.vCursor.click(this.nextButton);
  }

  async goPrev(): Promise<void> {
    await this.vCursor.click(this.prevButton);
  }
}
