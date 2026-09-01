// run with pnpm --filter @trapmap/web-panel test:e2e
import { expect, test } from '../helpers/fixtures.js';
import { ReviewQueuePage } from '../page-objects/review-queue-page.js';
import { TrapGraphPage } from '../page-objects/trap-graph-page.js';

test.describe('review queue', () => {
  test('loads queue, applies filter and sort via vCursor', async ({ page, mockApi, vCursor }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/reviews');
    const queue = new ReviewQueuePage(page, vCursor);
    await queue.waitForLoaded();
    await expect(page.getByText(/治理审核队列|governance review queue/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(queue.reviewItems.first()).toBeVisible({ timeout: 10_000 });
    await queue.filterByStatus('submitted');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(queue.reviewItems.first()).toBeVisible({ timeout: 10_000 });
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();
    if ((await searchInput.count()) > 0) {
      await searchInput.fill('runtime');
      await page.waitForTimeout(300).catch(() => {});
      await expect(queue.reviewItems.first()).toBeVisible({ timeout: 10_000 });
      await vCursor.click(searchInput);
      await searchInput.fill('');
    } else {
      await queue.search('runtime');
      await page.waitForTimeout(300).catch(() => {});
      await expect(queue.reviewItems.first()).toBeVisible({ timeout: 10_000 });
      await vCursor.click(queue.searchInput);
      await queue.clearSearch();
    }
  });

  test('click review item via vCursor and hover/drag on graph', async ({
    page,
    mockApi,
    vCursor,
  }) => {
    await mockApi.mockAllAuthenticated('administrator');
    await page.goto('/reviews');
    const queue = new ReviewQueuePage(page, vCursor);
    await queue.waitForLoaded();
    await expect(queue.reviewItems.first()).toBeVisible({ timeout: 10_000 });
    const firstLink = queue.reviewItems
      .first()
      .getByRole('link', { name: /查看详情|view details/i })
      .first();
    if ((await firstLink.count()) > 0) {
      await vCursor.click(firstLink);
    } else {
      await vCursor.click(queue.reviewItems.first());
    }
    await expect(page).toHaveURL(/\/reviews\/.+/);
    await page.goto('/trap-graph');
    const graph = new TrapGraphPage(page, vCursor);
    await graph.waitForLoaded();
    await graph.expectCanvasVisible();
    await vCursor.moveTo(graph.canvas);
    const secondGraph = page.locator('canvas').nth(1);
    if ((await secondGraph.count()) > 0) {
      await vCursor.dragTo(graph.canvas, secondGraph);
    } else {
      await vCursor.dragTo(graph.canvas, graph.canvas);
    }
    await expect(page.getByRole('heading', { name: /trap 图谱|trap graph/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
