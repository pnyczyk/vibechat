import { fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  SessionControls,
  SessionFeedback,
  ConnectionStatus,
} from "../../app/components/SessionControls";

type RenderProps = {
  status?: ConnectionStatus;
  feedback?: SessionFeedback | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  onFeedbackClose?: () => void;
  transcriptOpen?: boolean;
  onToggleTranscript?: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: () => void;
  voiceLevel?: number;
};

function renderSessionControls({
  status = "idle",
  feedback = null,
  onConnect = jest.fn(),
  onDisconnect = jest.fn(),
  muted = false,
  onToggleMute = jest.fn(),
  onFeedbackClose = jest.fn(),
  transcriptOpen = false,
  onToggleTranscript = jest.fn(),
  themeMode = "light",
  onToggleTheme,
  voiceLevel = 0,
}: RenderProps = {}) {
  const theme = createTheme();
  const result = render(
    <ThemeProvider theme={theme}>
      <SessionControls
        status={status}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        muted={muted}
        onToggleMute={onToggleMute}
        feedback={feedback}
        onFeedbackClose={onFeedbackClose}
        voiceActive={false}
        voiceHasMetrics={false}
        voiceLevel={voiceLevel}
        transcriptOpen={transcriptOpen}
        onToggleTranscript={onToggleTranscript}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
      />
    </ThemeProvider>,
  );

  return {
    ...result,
    onDisconnect,
    onToggleMute,
    onFeedbackClose,
    onToggleTranscript,
    onToggleTheme,
  };
}

describe("SessionControls", () => {
  it("invokes disconnect handler when connected", () => {
    const { onDisconnect } = renderSessionControls({ status: "connected" });

    fireEvent.click(
      screen.getByRole("button", { name: /disconnect session/i }),
    );

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("hides the disconnect control until a session is connected", () => {
    renderSessionControls();

    expect(
      screen.queryByRole("button", { name: /disconnect session/i }),
    ).not.toBeInTheDocument();
  });

  it("renders snackbar feedback and closes via the dismiss action", () => {
    const onFeedbackClose = jest.fn();
    renderSessionControls({
      feedback: { message: "Connected to session", severity: "success" },
      onFeedbackClose,
    });

    const feedback = screen.getByTestId("session-feedback");
    expect(feedback).toHaveTextContent("Connected to session");

    const closeButton = within(feedback).getByRole("button", {
      name: /close/i,
    });
    fireEvent.click(closeButton);

    expect(onFeedbackClose).toHaveBeenCalledTimes(1);
  });

  it("disables microphone control until connected", () => {
    renderSessionControls();

    const button = screen.getByRole("button", {
      name: /connect to enable microphone/i,
    });

    expect(button).toBeDisabled();
  });

  it("invokes mute toggle when connected", () => {
    const { onToggleMute } = renderSessionControls({ status: "connected" });

    fireEvent.click(screen.getByRole("button", { name: /mute microphone/i }));

    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it("shows unmute label when muted", () => {
    renderSessionControls({ status: "connected", muted: true });

    expect(
      screen.getByRole("button", { name: /unmute microphone/i }),
    ).toBeInTheDocument();
  });

  it("toggles transcript drawer when icon is clicked", () => {
    const { onToggleTranscript } = renderSessionControls();

    fireEvent.click(
      screen.getByRole("button", { name: /open transcript drawer/i }),
    );

    expect(onToggleTranscript).toHaveBeenCalledTimes(1);
  });

  it("disables theme toggle when handler missing", () => {
    renderSessionControls();

    const themeButton = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(themeButton).toBeDisabled();
  });

  it("enables theme toggle when handler provided", () => {
    const onToggleTheme = jest.fn();
    renderSessionControls({ onToggleTheme });

    const themeButton = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(themeButton).toBeEnabled();

    fireEvent.click(themeButton);

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("exposes edge-aligned metadata for layout styling", () => {
    renderSessionControls();

    expect(screen.getByTestId("session-controls")).toHaveAttribute("data-align", "edge");
  });
});
