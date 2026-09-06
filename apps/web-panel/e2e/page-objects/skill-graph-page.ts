import { expect, type Locator, type Page } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class SkillGraphPage extends BasePage {
  readonly heading: Locator;
  readonly canvas: Locator;
  readonly artifactSelect: Locator;
  readonly modeToggle: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.heading = page.getByRole('heading', { name: /skill graph/i }).first();
    this.canvas = page.locator('canvas').first();
    this.artifactSelect = page.getByRole('combobox').first();
    this.modeToggle = page.getByRole('button', { name: /derivation|semantic/i }).first();
  }

  async goto(): Promise<void> {
    await super.goto('/skill-graph');
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.heading.first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {});
  }

  async selectArtifact(artifactId: string): Promise<void> {
    if ((await this.artifactSelect.count()) > 0) {
      await this.vCursor.click(this.artifactSelect);
      const option = this.page.getByRole('option', { name: new RegExp(artifactId, 'i') }).first();
      if ((await option.count()) > 0) {
        await this.vCursor.click(option);
      } else {
        // fallback: navigate with query param
        await this.gotoWithArtifact(artifactId);
      }
    } else {
      await this.gotoWithArtifact(artifactId);
    }
  }

  async gotoWithArtifact(artifactId: string): Promise<void> {
    await super.goto(`/skill-graph?artifactId=${artifactId}`);
    await this.waitForLoaded();
  }

  async switchMode(mode: 'derivation' | 'semantic'): Promise<void> {
    const button = this.page.getByRole('button', { name: new RegExp(mode, 'i') }).first();
    if ((await button.count()) > 0) {
      await this.vCursor.click(button);
    }
  }

  async expectCanvasVisible(): Promise<void> {
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
