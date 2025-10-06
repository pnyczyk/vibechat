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
  onFeedbackClose?: () => void;
};

function renderSessionControls({
  status = "idle",
  feedback = null,
  onConnect = jest.fn(),
  onDisconnect = jest.fn(),
  onFeedbackClose = jest.fn(),
}: RenderProps = {}) {
  const theme = createTheme();
  const result = render(
    <ThemeProvider theme={theme}>
      <SessionControls
        status={status}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        feedback={feedback}
        onFeedbackClose={onFeedbackClose}
      />
    </ThemeProvider>,
  );

  return {
    ...result,
    onConnect,
    onDisconnect,
    onFeedbackClose,
  };
}

describe("SessionControls", () => {
  it("invokes connect handler when disconnected", () => {
    const { onConnect } = renderSessionControls();

    fireEvent.click(
      screen.getByRole("button", { name: /connect to session/i }),
    );

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("invokes disconnect handler when connected", () => {
    const { onDisconnect } = renderSessionControls({ status: "connected" });

    fireEvent.click(
      screen.getByRole("button", { name: /disconnect session/i }),
    );

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("does not trigger handlers while connecting", () => {
    const { onConnect, onDisconnect } = renderSessionControls({
      status: "connecting",
    });

    fireEvent.click(screen.getByRole("button", { name: /connecting/i }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("indicates error state via reconnect tooltip", () => {
    renderSessionControls({ status: "error" });

    expect(
      screen.getByRole("button", { name: /reconnect to session/i }),
    ).toBeInTheDocument();
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
});
