import { expect } from "@playwright/test";
import { test } from "./fixtures/session";

test.describe("UI Overhaul critical path", () => {
  test("connects, toggles controls, and uses transcript drawer", async ({ page }) => {
    await page.goto("/");

    const entryButton = page.getByRole("button", {
      name: /start voice session/i,
    });
    await expect(entryButton).toBeVisible();

    await entryButton.click();

    await expect(page.getByText(/status: connected/i)).toBeVisible();
    await expect(
      page.getByTestId("voice-activity-indicator"),
    ).toHaveAttribute("aria-label", /ai is speaking/i, { timeout: 7_500 });

    const muteButton = page.getByRole("button", { name: /mute microphone/i });
    await expect(muteButton).toBeEnabled();
    await muteButton.click();
    await expect(
      page.getByRole("button", { name: /unmute microphone/i }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /unmute microphone/i }).click();
    await expect(
      page.getByRole("button", { name: /mute microphone/i }),
    ).toHaveAttribute("aria-pressed", "false");

    const transcriptButton = page.getByTestId("transcript-toggle");
    await transcriptButton.click();

    const drawer = page.getByRole("dialog", { name: /transcript drawer/i });
    await expect(drawer).toBeVisible();
    await expect(transcriptButton).toHaveAttribute(
      "aria-label",
      /close transcript drawer/i,
    );

    const messageField = page.getByLabel("Send a message");
    await messageField.fill("Test message");
    await messageField.press("Enter");

    const transcriptList = page.getByTestId("transcript-entries");
    await expect(transcriptList).toContainText("Test message");
    await expect(transcriptList).toContainText("Odpowiedź na: Test message");

    await expect(page.getByTestId("session-feedback")).toContainText(
      /message sent/i,
    );

    await drawer.getByRole("button", { name: /close transcript/i }).click();
    await expect(drawer).toBeHidden();

    await expect(
      page.getByRole("button", { name: /disconnect session/i }),
    ).toBeVisible();
  });
});
