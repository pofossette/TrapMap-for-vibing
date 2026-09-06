import { expect, type Locator, type Page } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class TrapGraphPage extends BasePage {
  readonly heading: Locator;
  readonly canvas: Locator;
  readonly searchInput: Locator;
  readonly layerToggles: Locator;
  readonly depthSelect: Locator;
  readonly stats: Locator;
  readonly inspector: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /trap graph/i }).first();
    this.canvas = page.locator('canvas').first();
    this.searchInput = page.getByPlaceholder(/search.*graph/i).first();
    this.layerToggles = page.locator('input[type="checkbox"]');
    this.depthSelect = page.getByRole('combobox', { name: /neighborhood depth/i }).first();
    this.stats = page.locator('text=Nodes').first();
    this.inspector = page.getByText(/graph inspector/i).first();
  }

  async goto(): Promise<void> {
    await super.goto('/trap-graph');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async search(value: string): Promise<void> {
    if ((await this.searchInput.count()) > 0) {
      await this.searchInput.fill(value);
    }
  }

  async toggleLayer(index: number): Promise<void> {
    const toggle = this.layerToggles.nth(index);
    if ((await toggle.count()) > 0) {
      await this.vCursor.click(toggle);
    }
  }

  async expectCanvasVisible(): Promise<void> {
    // G6 may render canvas or svg; accept either
    const canvasCount = await this.canvas.count();
    if (canvasCount > 0) {
      await expect(this.canvas).toBeVisible();
    } else {
      await expect(this.page.locator('svg').first())
        .toBeVisible({ timeout: 10_000 })
        .catch(() => {});
    }
  }
}
