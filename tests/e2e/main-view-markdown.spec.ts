import { expect } from "@playwright/test";
import { test, throttleToFast3G } from "./fixtures/session";

const MARKDOWN_PAYLOAD = `# Quarterly Memo\n\n- Revenue up **24%**\n- Expansion continues\n\n| Region | Q1 | Q2 |\n| ------ | --- | --- |\n| NA | 12.4 | 13.1 |\n| LATAM | 3.1 | 4.8 |\n\nInline math $a^2 + b^2 = c^2$ and block math:$$\\frac{a}{b} = \\sum_{n=1}^{\\infty} x_n$$`;

test.describe("Markdown viewer", () => {
  test("shows show_markdown output and logs telemetry", async ({ page }) => {
    test.setTimeout(60_000);
    const restoreNetwork = await throttleToFast3G(page);

    await page.addInitScript(() => {
      const globalWindow = window as typeof window & {
        __vibeTelemetryEvents?: Array<{ event: string; payload: unknown }>;
      };
      globalWindow.__vibeTelemetryEvents = [];
      window.addEventListener("vibechat:telemetry", (event) => {
        const detail = (event as CustomEvent<{ event: string; payload: unknown }>).detail;
        globalWindow.__vibeTelemetryEvents?.push(detail);
      });
    });

    try {
      await page.goto("/");

      const entryButton = page.getByRole("button", { name: /start voice session/i });
      await expect(entryButton).toBeVisible();
      await entryButton.click();

      await expect(page.getByTestId("session-feedback")).toContainText(
        /connected to session/i,
      );

      await page.waitForFunction(() => Boolean((window as typeof window & {
          __vibeMarkdownStore?: { apply(input: unknown): unknown };
        }).__vibeMarkdownStore));

      await page.evaluate((markdown) => {
        const scopedWindow = window as typeof window & {
          __vibeMarkdownStore?: { apply(input: unknown): unknown };
        };
        scopedWindow.__vibeMarkdownStore?.apply({
          title: "Quarterly Memo",
          markdown,
        });
      }, MARKDOWN_PAYLOAD);

      const viewer = page.getByTestId("markdown-viewer");
      await expect(viewer).toBeVisible();
      await expect(viewer).toContainText(/quarterly memo/i);
      await expect(viewer).toContainText(/Revenue up/i);
      await expect(viewer).toHaveAttribute("tabindex", "0");
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.locator(".katex").first()).toBeVisible();

      await page.waitForTimeout(5_500);

      const telemetry = await page.evaluate(() => {
        const scopedWindow = window as typeof window & {
          __vibeTelemetryEvents?: Array<{ event: string; payload: Record<string, unknown> }>;
        };
        return scopedWindow.__vibeTelemetryEvents ?? [];
      });

      const renderEvents = telemetry.filter((entry) => entry.event === "session_markdown_rendered");
      const engagementEvents = telemetry.filter(
        (entry) => entry.event === "session_markdown_engagement",
      );

      expect(renderEvents).toHaveLength(1);
      expect(renderEvents[0]?.payload.title).toBe("Quarterly Memo");
      expect(renderEvents[0]?.payload.bytes).toBeGreaterThan(0);

      expect(engagementEvents).toHaveLength(1);
      expect(engagementEvents[0]?.payload.documentId).toBe(
        renderEvents[0]?.payload.documentId,
      );
      expect(Number(engagementEvents[0]?.payload.durationMs)).toBeGreaterThanOrEqual(5_000);
    } finally {
      await restoreNetwork();
    }
  });
});
