import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TranscriptDrawer } from "../../app/components/TranscriptDrawer";
import type { TranscriptEntry } from "../../app/lib/transcript-store";

function renderTranscriptDrawer(
  props: Partial<ComponentProps<typeof TranscriptDrawer>> = {},
) {
  const theme = createTheme();
  return render(
    <ThemeProvider theme={theme}>
      <TranscriptDrawer
        open
        onClose={jest.fn()}
        entries={[]}
        onSendMessage={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("TranscriptDrawer", () => {
  it("renders entries in chronological order", async () => {
    const entries: TranscriptEntry[] = [
      { id: "1", role: "user", text: "Hello" },
      { id: "2", role: "assistant", text: "Hi there" },
    ];

    renderTranscriptDrawer({ entries });

    expect(screen.getByText(/hello/i)).toBeInTheDocument();
    expect(screen.getByText(/hi there/i)).toBeInTheDocument();

    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items[items.length - 1]).toHaveTextContent(/hi there/i);
    });
  });

  it("submits text input via provided handler", async () => {
    const onSendMessage = jest.fn();

    renderTranscriptDrawer({ onSendMessage });

    const textarea = screen.getByLabelText(/send a message/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "   Test message   " } });
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    });

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("Test message");
      expect(textarea).toHaveValue("");
    });
  });

  it("sends message when pressing enter without shift", async () => {
    const onSendMessage = jest.fn();

    renderTranscriptDrawer({ onSendMessage });

    const textarea = screen.getByLabelText(/send a message/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello there" } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    });

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("Hello there");
      expect(textarea).toHaveValue("");
    });
  });

  it("keeps multiline input when pressing shift+enter", async () => {
    const onSendMessage = jest.fn();

    renderTranscriptDrawer({ onSendMessage });

    const textarea = screen.getByLabelText(/send a message/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello" } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
      });
      fireEvent.change(textarea, { target: { value: "Hello\n" } });
    });

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Hello\n");
  });

  it("disables input and shows helper when session inactive", () => {
    renderTranscriptDrawer({ inputDisabled: true });

    const textarea = screen.getByLabelText(/send a message/i);
    expect(textarea).toBeDisabled();
    expect(
      screen.getByText(/connect the session to send transcript messages/i),
    ).toBeInTheDocument();
  });

  it("invokes close handler when close button clicked", () => {
    const onClose = jest.fn();
    renderTranscriptDrawer({ onClose });

    fireEvent.click(screen.getByRole("button", { name: /close transcript/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows keyboard focus on the message field", () => {
    renderTranscriptDrawer();

    const textarea = screen.getByLabelText(/send a message/i);
    textarea.focus();

    expect(textarea).toHaveFocus();
  });
});
