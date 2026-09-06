import { expect, type Locator, type Page } from '@playwright/test';

import type { VCursor } from '../helpers/v-cursor.js';
import { BasePage } from './base-page.js';

export type ShellRole = 'administrator' | 'reviewer' | 'read-only-operator' | null;

export class AppShell extends BasePage {
  readonly dashboardLink: Locator;
  readonly reviewsLink: Locator;
  readonly artifactsLink: Locator;
  readonly trapGraphLink: Locator;
  readonly skillGraphLink: Locator;
  readonly activityLink: Locator;
  readonly themeButton: Locator;
  readonly languageButton: Locator;
  readonly userMenuTrigger: Locator;
  readonly header: Locator;
  readonly sidebar: Locator;
  readonly mobileMenuButton: Locator;

  constructor(page: Page, vCursor: VCursor) {
    super(page, vCursor);
    this.header = page.locator('header');
    this.sidebar = page.locator('aside').first();
    // Navigation uses react-router NavLink with translated labels; fall back to href matcher
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i }).first();
    this.reviewsLink = page.locator('a[href="/reviews"]').first();
    this.artifactsLink = page.locator('a[href="/artifacts"]').first();
    this.trapGraphLink = page.locator('a[href="/trap-graph"]').first();
    this.skillGraphLink = page.locator('a[href="/skill-graph"]').first();
    this.activityLink = page.locator('a[href="/activity"]').first();
    this.themeButton = page.getByRole('button', { name: /dark|light/i }).first();
    this.languageButton = page.getByRole('button', { name: /EN|中文/i }).first();
    // User menu trigger is inside header, shows displayName
    this.userMenuTrigger = this.header.locator('button').last();
    this.mobileMenuButton = page.getByRole('button', { name: /open menu|close menu/i }).first();
  }

  async navigateTo(path: string): Promise<void> {
    const map: Record<string, Locator> = {
      '/': this.dashboardLink,
      '/reviews': this.reviewsLink,
      '/artifacts': this.artifactsLink,
      '/trap-graph': this.trapGraphLink,
      '/skill-graph': this.skillGraphLink,
      '/activity': this.activityLink,
    };
    const link = map[path];
    if (link) {
      await this.vCursor.click(link);
      await this.page.waitForURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await this.waitForLoaded();
      return;
    }
    await this.goto(path);
  }

  async expectVisibleNavForRole(role: ShellRole): Promise<void> {
    // Dashboard, artifacts, graphs, activity visible for all authenticated roles
    await expect(this.dashboardLink).toBeVisible();
    await expect(this.artifactsLink).toBeVisible();
    await expect(this.trapGraphLink).toBeVisible();
    await expect(this.skillGraphLink).toBeVisible();
    await expect(this.activityLink).toBeVisible();
    if (role === 'read-only-operator') {
      // Reviews is hidden for read-only-operator per navigationItems roles filter
      await expect(this.reviewsLink).toHaveCount(0);
    } else if (role === 'administrator' || role === 'reviewer') {
      await expect(this.reviewsLink).toBeVisible();
    } else if (role === null) {
      // unauthenticated shell not rendered; page should be on login
      await expect(this.page).toHaveURL(/\/login/);
    }
  }

  async expectShellVisible(): Promise<void> {
    await expect(this.header).toBeVisible();
    // sidebar hidden on mobile, check header branding
    await expect(this.page.getByText('TrapMap').first()).toBeVisible();
  }

  async toggleTheme(): Promise<void> {
    await this.vCursor.click(this.themeButton);
  }

  async switchLanguage(): Promise<void> {
    await this.vCursor.click(this.languageButton);
  }

  async openUserMenu(): Promise<void> {
    // Ensure user is authenticated before opening
    await this.userMenuTrigger.waitFor({ state: 'visible', timeout: 10_000 });
    await this.vCursor.click(this.userMenuTrigger);
  }

  async expectUserVisible(displayName: string | RegExp): Promise<void> {
    await expect(this.header.getByText(displayName).first()).toBeVisible();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    const logoutItem = this.page.getByRole('menuitem', { name: /log out/i }).first();
    const logoutFallback = this.page.getByText(/log out/i).first();
    if ((await logoutItem.count()) > 0) {
      await this.vCursor.click(logoutItem);
    } else {
      await this.vCursor.click(logoutFallback);
    }
    await this.page.waitForURL(/\/login/);
  }

  async closeMobileMenuIfOpen(): Promise<void> {
    if ((await this.mobileMenuButton.count()) > 0) {
      const label = await this.mobileMenuButton.getAttribute('aria-label').catch(() => null);
      if (label?.toLowerCase().includes('close')) {
        await this.vCursor.click(this.mobileMenuButton);
      }
    }
  }
}
