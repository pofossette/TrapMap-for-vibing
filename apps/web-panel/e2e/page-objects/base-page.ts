import type { Page } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';

export class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly vCursor: VCursor,
  ) {}

  get pageInstance(): Page {
    return this.page;
  }

  get cursor(): VCursor {
    return this.vCursor;
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async waitForShell(): Promise<void> {
    // Shell contains TrapMap branding and navigation
    await this.page.waitForSelector('text=TrapMap', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async waitForLoaded(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async expectPath(path: string): Promise<void> {
    const { expect } = await import('@playwright/test');
    await expect(this.page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }
}
