import { expect } from "@playwright/test";
import { test } from "./fixtures/session";

const RESOURCE_EVENTS_ROUTE = "**/api/mcp/resource-events";

test.describe("MCP resource tracking", () => {
  test("streams tracker updates into the transcript", async ({ page }) => {
    test.setTimeout(45_000);

    await page.route(RESOURCE_EVENTS_ROUTE, async (route) => {
      const timestamp = Date.now();
      const body = [
        "retry: 5000\n\n",
        `data: {"type":"handshake","status":"ready","timestamp":${timestamp}}\n\n`,
        `data: {"type":"resource_update","serverId":"codex-tasks","resourceUri":"task://demo-resource","timestamp":${timestamp + 1000}}\n\n`,
      ].join("");

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
        },
        body,
      });

      await page.unroute(RESOURCE_EVENTS_ROUTE);
    });

    await page.goto("/");

    const entryButton = page.getByRole("button", { name: /start voice session/i });
    await entryButton.click();

    await expect(page.getByTestId("session-feedback")).toContainText(
      /connected to session/i,
    );

    await page.getByTestId("transcript-toggle").click();

    await expect(page.getByTestId("transcript-entries")).toContainText(
      /Resource task:\/\/demo-resource updated for MCP server codex-tasks/i,
    );
  });
});
