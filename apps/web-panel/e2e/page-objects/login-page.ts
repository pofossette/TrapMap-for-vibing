import { type Locator, type Page, expect } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export class LoginPage extends BasePage {
  readonly accessKeyInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly heading: Locator;
  readonly description: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.accessKeyInput = page.locator('#accessKey');
    this.loginButton = page.getByRole('button', { name: /log in|login/i });
    this.errorMessage = page.locator('p.text-rose-500');
    this.heading = page.getByRole('heading', { name: /log in|sign in|access/i }).first();
    this.description = page.getByText(/access key|admin workspace|TrapMap/i).first();
  }

  async goto(): Promise<void> {
    await super.goto('/login');
    await this.waitForLoaded();
  }

  async fillAccessKey(key: string): Promise<void> {
    await this.accessKeyInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.accessKeyInput.fill(key);
  }

  async submit(): Promise<void> {
    await this.vCursor.click(this.loginButton);
  }

  async loginWithKey(key: string): Promise<void> {
    await this.fillAccessKey(key);
    await this.submit();
  }

  async expectError(message?: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
    if (message !== undefined) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectNoError(): Promise<void> {
    await expect(this.errorMessage).toHaveCount(0);
  }

  async expectLoginButtonDisabled(): Promise<void> {
    await expect(this.loginButton).toBeDisabled();
  }

  async expectLoginButtonEnabled(): Promise<void> {
    await expect(this.loginButton).toBeEnabled();
  }

  async expectVisible(): Promise<void> {
    await expect(this.accessKeyInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  async expectRedirectToLogin(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login/);
  }
}
