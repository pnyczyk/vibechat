import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const toBytesPerSecond = (megabits: number) => {
  const value = (megabits * 1024 * 1024) / 8;
  return Math.max(1, Math.floor(value));
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/realtime-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ value: "test-api-key" }),
      });
    });

    await use(page);
  },
});

export { expect };

export async function throttleToFast3G(page: Page): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: toBytesPerSecond(1.6),
    uploadThroughput: toBytesPerSecond(0.75),
    connectionType: "cellular3g",
  });

  return async () => {
    try {
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: "none",
      });
    } catch (error) {
      if (process.env.DEBUG?.includes("playwright")) {
        // eslint-disable-next-line no-console
        console.warn("Failed to restore network conditions", error);
      }
    } finally {
      await session.detach().catch(() => undefined);
    }
  };
}
