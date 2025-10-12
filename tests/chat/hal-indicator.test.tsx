import { render } from "@testing-library/react";
import { HalIndicator, calculateHalGlow } from "../../app/components/HalIndicator";

describe("HalIndicator", () => {
  it("marks active state when speaking", () => {
    const { getByTestId } = render(<HalIndicator level={0.8} active hasMetrics />);

    const indicator = getByTestId("voice-activity-indicator");
    expect(indicator).toHaveAttribute("data-state", "active");
    expect(indicator.style.getPropertyValue("--hal-intensity")).toBe("0.97");
  });

  it("falls back to waiting state when metrics unavailable", () => {
    const { getByTestId } = render(
      <HalIndicator level={0} active={false} hasMetrics={false} />,
    );

    const indicator = getByTestId("voice-activity-indicator");
    expect(indicator).toHaveAttribute("data-state", "waiting");
    expect(indicator.style.getPropertyValue("--hal-intensity")).toBe("0.08");
  });

  it("keeps glow calculation within performance budget", () => {
    const iterations = 2000;
    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      const level = (index % 100) / 99;
      const active = index % 2 === 0;
      calculateHalGlow(level, true, active);
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(4);
  });
});
