import type { Locator, Page } from '@playwright/test';

export interface VCursorOptions {
  visible?: boolean;
  color?: string;
  size?: number;
  trail?: boolean;
  moveDurationMs?: number;
  clickDurationMs?: number;
}

const DEFAULT_OPTIONS: Required<VCursorOptions> = {
  visible: true,
  color: '#faff69',
  size: 20,
  trail: false,
  moveDurationMs: 300,
  clickDurationMs: 150,
};

function resolveOptions(options?: VCursorOptions): Required<VCursorOptions> {
  return {
    visible: options?.visible ?? DEFAULT_OPTIONS.visible,
    color: options?.color ?? DEFAULT_OPTIONS.color,
    size: options?.size ?? DEFAULT_OPTIONS.size,
    trail: options?.trail ?? DEFAULT_OPTIONS.trail,
    moveDurationMs: options?.moveDurationMs ?? DEFAULT_OPTIONS.moveDurationMs,
    clickDurationMs: options?.clickDurationMs ?? DEFAULT_OPTIONS.clickDurationMs,
  };
}

type Box = { x: number; y: number; width: number; height: number };

export class VCursor {
  private readonly resolved: Required<VCursorOptions>;
  private initialized = false;
  private position: { x: number; y: number } = { x: 0, y: 0 };
  private visibleState: boolean;

  constructor(
    public page: Page,
    public options?: VCursorOptions,
  ) {
    this.resolved = resolveOptions(options);
    this.visibleState = this.resolved.visible;
  }

  async init(): Promise<void> {
    const opts = this.resolved;

    const inject = (options: Required<VCursorOptions>) => {
      if (document.querySelector('[data-v-cursor]')) {
        return;
      }

      let style = document.querySelector('style[data-v-cursor-style]') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.setAttribute('data-v-cursor-style', '');
        style.textContent = `
          [data-v-cursor] {
            position: fixed;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 999999;
            will-change: left, top, transform;
            filter: drop-shadow(1px 2px 3px rgba(0, 0, 0, 0.45));
            transition: left var(--v-cursor-move-duration, 300ms) ease-out, top var(--v-cursor-move-duration, 300ms) ease-out, transform 150ms ease-out, opacity 200ms ease;
          }
          [data-v-cursor-trail-container] {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 999998;
            overflow: visible;
          }
          [data-v-cursor-ripple] {
            position: fixed;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 999998;
            transform: translate(-50%, -50%) scale(0);
            animation: v-cursor-ripple 600ms ease-out forwards;
          }
          @keyframes v-cursor-ripple {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 0.7; }
            100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
          }
          @keyframes v-cursor-trail-fade {
            0% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.35); }
          }
        `;
        document.head.appendChild(style);
      }

      const cursor = document.createElement('div');
      cursor.setAttribute('data-v-cursor', '');
      cursor.style.left = '0px';
      cursor.style.top = '0px';
      cursor.style.width = `${options.size}px`;
      cursor.style.height = `${options.size}px`;
      cursor.style.opacity = options.visible ? '1' : '0';
      cursor.style.setProperty('--v-cursor-move-duration', `${options.moveDurationMs}ms`);
      cursor.style.setProperty('--v-cursor-color', options.color);
      cursor.innerHTML = `
        <svg width="${options.size}" height="${options.size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:100%;height:100%;display:block;">
          <path d="M4 4L19.5 12L12.2 12.6L11.6 19.9L4 4Z" fill="${options.color}" stroke="black" stroke-width="0.9" stroke-linejoin="round" />
        </svg>
      `;

      const targetBody = document.body ?? document.documentElement;
      targetBody.appendChild(cursor);

      let trailContainer = document.querySelector(
        '[data-v-cursor-trail-container]',
      ) as HTMLElement | null;
      if (!trailContainer) {
        trailContainer = document.createElement('div');
        trailContainer.setAttribute('data-v-cursor-trail-container', '');
        targetBody.appendChild(trailContainer);
      }
    };

    try {
      await this.page.addInitScript(inject as unknown as string, opts);
    } catch {
      // ignore addInitScript failures on closed context
    }

    try {
      await this.page.evaluate(inject as unknown as (o: Required<VCursorOptions>) => void, opts);
    } catch {
      // page may not have document yet, addInitScript will cover next navigation
    }

    this.initialized = true;
    if (!opts.visible) {
      this.visibleState = false;
    }
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.init();
  }

  private async resolveBox(locator: Locator): Promise<Box> {
    const count = await locator.count();
    if (count === 0) {
      throw new Error('VCursor: locator resolved to 0 elements');
    }
    const target = locator.first();
    await target.scrollIntoViewIfNeeded();
    let box = await target.boundingBox();
    if (!box) {
      const rect = await target
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })
        .catch(() => null);
      if (rect && typeof rect.x === 'number' && typeof rect.width === 'number') {
        box = rect as Box;
      }
    }
    if (!box) {
      throw new Error('VCursor: unable to resolve element bounding box');
    }
    return box;
  }

  private async animateTo(x: number, y: number, durationMs: number): Promise<void> {
    await this.ensureInit();
    const opts = this.resolved;
    const from = { ...this.position };

    await this.page
      .evaluate(
        ({
          x: toX,
          y: toY,
          durationMs: dur,
          trail,
          color,
          fromX,
          fromY,
        }: {
          x: number;
          y: number;
          durationMs: number;
          trail: boolean;
          color: string;
          fromX: number;
          fromY: number;
        }) => {
          const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
          if (!cursor) {
            return;
          }
          cursor.style.setProperty('--v-cursor-move-duration', `${dur}ms`);
          cursor.style.transition = `left ${dur}ms ease-out, top ${dur}ms ease-out, transform 150ms ease-out, opacity 200ms ease`;
          cursor.style.left = `${toX}px`;
          cursor.style.top = `${toY}px`;

          if (trail) {
            const container = document.querySelector(
              '[data-v-cursor-trail-container]',
            ) as HTMLElement | null;
            if (container) {
              const dotCount = 5;
              const hasFrom =
                Number.isFinite(fromX) && Number.isFinite(fromY) && (fromX !== 0 || fromY !== 0);
              for (let i = 0; i < dotCount; i += 1) {
                const ratio = (i + 1) / dotCount;
                const ix = hasFrom ? fromX + (toX - fromX) * ratio : toX;
                const iy = hasFrom ? fromY + (toY - fromY) * ratio : toY;
                const dot = document.createElement('div');
                dot.setAttribute('data-v-cursor-trail-dot', '');
                dot.style.position = 'fixed';
                dot.style.left = `${ix}px`;
                dot.style.top = `${iy}px`;
                dot.style.width = '6px';
                dot.style.height = '6px';
                dot.style.borderRadius = '50%';
                dot.style.background = color;
                dot.style.opacity = '0.62';
                dot.style.transform = 'translate(-50%, -50%) scale(1)';
                dot.style.pointerEvents = 'none';
                dot.style.zIndex = '999997';
                dot.style.transition = 'opacity 700ms ease-out, transform 700ms ease-out';
                container.appendChild(dot);
                const delay = i * 22;
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    dot.style.opacity = '0';
                    dot.style.transform = 'translate(-50%, -50%) scale(0.35)';
                  }, 12 + delay);
                });
                setTimeout(() => {
                  dot.remove();
                }, 850 + delay);
              }
            }
          }
        },
        { x, y, durationMs, trail: opts.trail, color: opts.color, fromX: from.x, fromY: from.y },
      )
      .catch(() => {
        // ignore if page detached
      });

    this.position = { x, y };
    await this.page.waitForTimeout(durationMs).catch(() => {
      // ignore timeout errors on closed page
    });
  }

  private async showRipple(x: number, y: number): Promise<void> {
    const color = this.resolved.color;
    await this.page
      .evaluate(
        ({ x: rx, y: ry, color: c }: { x: number; y: number; color: string }) => {
          const ripple = document.createElement('div');
          ripple.setAttribute('data-v-cursor-ripple', '');
          ripple.style.left = `${rx}px`;
          ripple.style.top = `${ry}px`;
          ripple.style.borderColor = c;
          ripple.style.background = `${c}30`;
          const targetBody = document.body ?? document.documentElement;
          targetBody.appendChild(ripple);
          setTimeout(() => {
            ripple.remove();
          }, 600);
        },
        { x, y, color },
      )
      .catch(() => {
        // ignore
      });
  }

  async moveTo(
    locator: Locator,
    opts?: { offset?: { x: number; y: number }; durationMs?: number },
  ): Promise<void> {
    const box = await this.resolveBox(locator);
    const offset = opts?.offset ?? { x: 0, y: 0 };
    const duration = opts?.durationMs ?? this.resolved.moveDurationMs;
    const x = box.x + box.width / 2 + offset.x;
    const y = box.y + box.height / 2 + offset.y;
    await this.animateTo(x, y, duration);
  }

  async click(
    locator: Locator,
    opts?: {
      button?: 'left' | 'right';
      clickCount?: number;
      delay?: number;
      showRipple?: boolean;
      durationMs?: number;
    },
  ): Promise<void> {
    const duration = opts?.durationMs ?? this.resolved.moveDurationMs;
    const shouldRipple = opts?.showRipple ?? true;
    await this.moveTo(locator, { durationMs: duration });

    const pos = { ...this.position };
    const clickDuration = this.resolved.clickDurationMs;

    await this.page
      .evaluate(
        ({ clickDuration: cd }: { clickDuration: number }) => {
          const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
          if (!cursor) {
            return;
          }
          cursor.style.transform = 'scale(0.86)';
          setTimeout(() => {
            cursor.style.transform = 'scale(1)';
          }, cd);
        },
        { clickDuration },
      )
      .catch(() => {
        // ignore
      });

    if (shouldRipple) {
      await this.showRipple(pos.x, pos.y);
    }

    await this.page.waitForTimeout(clickDuration).catch(() => {
      // ignore
    });

    await locator.click({
      button: opts?.button,
      clickCount: opts?.clickCount,
      delay: opts?.delay,
    });
  }

  async hover(locator: Locator): Promise<void> {
    await this.moveTo(locator);
    await locator.hover();
  }

  async dblclick(locator: Locator): Promise<void> {
    await this.moveTo(locator);
    await locator.dblclick();
  }

  async dragTo(source: Locator, target: Locator): Promise<void> {
    await this.moveTo(source);
    const from = { ...this.position };
    await this.page.mouse.move(from.x, from.y).catch(() => {
      // ignore
    });
    await this.page.mouse.down().catch(() => {
      // ignore
    });
    await this.moveTo(target);
    const to = { ...this.position };
    await this.page.mouse.move(to.x, to.y).catch(() => {
      // ignore
    });
    await this.page.mouse.up().catch(() => {
      // ignore
    });
  }

  async typeWithCursor(locator: Locator, text: string): Promise<void> {
    await this.moveTo(locator);
    await locator.click();
    try {
      await locator.fill(text);
    } catch {
      await locator.pressSequentially(text);
    }
  }

  async hide(): Promise<void> {
    await this.page
      .evaluate(() => {
        const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
        if (cursor) {
          cursor.style.opacity = '0';
        }
      })
      .catch(() => {
        // ignore
      });
    this.visibleState = false;
  }

  async show(): Promise<void> {
    await this.page
      .evaluate(() => {
        const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
        if (cursor) {
          cursor.style.opacity = '1';
        }
      })
      .catch(() => {
        // ignore
      });
    this.visibleState = true;
  }

  async setPosition(x: number, y: number): Promise<void> {
    await this.page
      .evaluate(
        ({ x: px, y: py }: { x: number; y: number }) => {
          const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
          if (!cursor) {
            return;
          }
          cursor.style.transition = 'none';
          cursor.style.left = `${px}px`;
          cursor.style.top = `${py}px`;
          void cursor.offsetHeight;
          cursor.style.transition =
            'left var(--v-cursor-move-duration, 300ms) ease-out, top var(--v-cursor-move-duration, 300ms) ease-out, transform 150ms ease-out, opacity 200ms ease';
        },
        { x, y },
      )
      .catch(() => {
        // ignore
      });
    this.position = { x, y };
  }

  async getPosition(): Promise<{ x: number; y: number }> {
    try {
      const pos = await this.page.evaluate(() => {
        const cursor = document.querySelector('[data-v-cursor]') as HTMLElement | null;
        if (!cursor) {
          return null;
        }
        const left = Number.parseFloat(cursor.style.left || '0');
        const top = Number.parseFloat(cursor.style.top || '0');
        if (Number.isNaN(left) || Number.isNaN(top)) {
          return null;
        }
        return { x: left, y: top };
      });
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        this.position = pos;
        return pos;
      }
    } catch {
      // fall back to cached
    }
    return { ...this.position };
  }
}

export function createVCursor(page: Page, options?: VCursorOptions): VCursor {
  return new VCursor(page, options);
}
