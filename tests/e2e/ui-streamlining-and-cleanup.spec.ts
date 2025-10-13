import type { Locator } from "@playwright/test";
import { test, expect, throttleToFast3G } from "./fixtures/session";

const readHalIntensity = async (locator: Locator) => {
  const style = await locator.evaluate((element) => element.getAttribute("style") ?? "");
  const match = style.match(/--hal-intensity:\s*([0-9.]+)/);
  return match ? Number.parseFloat(match[1]) : null;
};

test.describe("UI streamlining and cleanup critical path", () => {
  test("entry overlay, indicator, and theme persistence", async ({ page }) => {
    test.setTimeout(60_000);
    const restoreNetwork = await throttleToFast3G(page);

    try {
      await page.goto("/");

      const layout = page.getByTestId("chat-layout");
      await expect(layout).toHaveAttribute("data-dimmed", "true");

      const entryButton = page.getByRole("button", { name: /start voice session/i });
      await expect(entryButton).toBeVisible();

      await entryButton.click();

      await expect(page.getByText(/status: connected/i)).toBeVisible({ timeout: 10_000 });
      await expect(layout).toHaveAttribute("data-dimmed", "false");

      const indicator = page.getByTestId("voice-activity-indicator");
      await expect(indicator).toHaveAttribute("data-ready", "true", { timeout: 5_000 });
      await expect(indicator).toHaveAttribute("data-state", "active");

      const activeIntensity = await readHalIntensity(indicator);
      expect(activeIntensity).not.toBeNull();
      expect(activeIntensity as number).toBeGreaterThan(0.9);

      await page.evaluate(() => {
        const scopedWindow = window as typeof window & {
          __vibeMockSession?: { setAudioLevel(level: number): void };
        };
        scopedWindow.__vibeMockSession?.setAudioLevel(0);
      });

      await page.waitForTimeout(600);
      await expect(indicator).toHaveAttribute("data-state", "idle", { timeout: 2_000 });

      const idleIntensity = await readHalIntensity(indicator);
      expect(idleIntensity).not.toBeNull();
      expect(idleIntensity as number).toBeLessThan(0.5);

      const themeToggle = page.getByRole("button", { name: /switch to dark mode/i });
      await themeToggle.click();

      const themeToggleAfterClick = page.getByRole("button", { name: /switch to light mode/i });
      await expect(themeToggleAfterClick).toHaveAttribute("aria-pressed", "true");

      const colorScheme = await page.evaluate(() => document.documentElement.style.colorScheme);
      expect(colorScheme).toBe("dark");

      await page.reload();

      await expect(layout).toHaveAttribute("data-dimmed", "true");
      const persistedThemeToggle = page.getByRole("button", { name: /switch to light mode/i });
      await expect(persistedThemeToggle).toHaveAttribute("aria-pressed", "true");

      const persistedScheme = await page.evaluate(
        () => document.documentElement.style.colorScheme,
      );
      expect(persistedScheme).toBe("dark");

      const entryButtonAfterReload = page.getByRole("button", {
        name: /start voice session/i,
      });
      await entryButtonAfterReload.click();

      await expect(page.getByText(/status: connected/i)).toBeVisible({ timeout: 10_000 });
      await expect(layout).toHaveAttribute("data-dimmed", "false");

      const disconnectButton = page.getByRole("button", { name: /disconnect session/i });
      await disconnectButton.click();

      await expect(layout).toHaveAttribute("data-dimmed", "true");
      await expect(page.getByRole("button", { name: /start voice session/i })).toBeVisible();
    } finally {
      await restoreNetwork();
    }
  });
});
