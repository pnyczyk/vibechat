"use client";

import { MouseEvent, SyntheticEvent } from "react";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import LogoutIcon from "@mui/icons-material/Logout";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import SubjectIcon from "@mui/icons-material/Subject";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { HalIndicator } from "./HalIndicator";
import styles from "./controls.module.css";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type SessionFeedback = {
  message: string;
  severity: "success" | "error";
};

export type SessionControlsProps = {
  status: ConnectionStatus;
  onDisconnect: () => void | Promise<void>;
  muted: boolean;
  onToggleMute: () => void;
  feedback: SessionFeedback | null;
  onFeedbackClose: () => void;
  voiceActive: boolean;
  voiceHasMetrics: boolean;
  voiceLevel: number;
  transcriptOpen: boolean;
  onToggleTranscript: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: (() => void) | null;
};

export function SessionControls({
  status,
  onDisconnect,
  muted,
  onToggleMute,
  feedback,
  onFeedbackClose,
  voiceActive,
  voiceHasMetrics,
  voiceLevel,
  transcriptOpen,
  onToggleTranscript,
  themeMode = "light",
  onToggleTheme,
}: SessionControlsProps) {
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";

  const micLabel = !isConnected
    ? "Connect to enable microphone"
    : muted
      ? "Unmute microphone"
      : "Mute microphone";

  const transcriptLabel = transcriptOpen
    ? "Close transcript drawer"
    : "Open transcript drawer";

  const resolvedThemeMode = themeMode === "dark" ? "dark" : "light";
  const themeLabel =
    resolvedThemeMode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const themeDisabled = typeof onToggleTheme !== "function";

  const disconnectColor = "error";
  const micColor = muted ? "error" : "primary";
  const micDisabled = !isConnected || isConnecting;

  const handleDisconnectClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onDisconnect();
  };

  const handleSnackbarClose = (_: SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") {
      return;
    }
    onFeedbackClose();
  };

  return (
    <>
      <div className={styles.rail} data-testid="session-controls" data-align="edge">
        {isConnected ? (
          <IconButton
            aria-label="Disconnect session"
            aria-pressed
            color={disconnectColor}
            onClick={handleDisconnectClick}
            size="large"
            className={styles.iconButton}
            title="Disconnect session"
          >
            <LogoutIcon fontSize="inherit" />
          </IconButton>
        ) : null}
        <IconButton
          aria-label={micLabel}
          aria-pressed={muted}
          color={micColor}
          disabled={micDisabled}
          onClick={(event) => {
            event.preventDefault();
            if (micDisabled) {
              return;
            }
            onToggleMute();
          }}
          size="large"
          className={styles.iconButton}
          title={micLabel}
        >
          {muted ? <MicOffIcon fontSize="inherit" /> : <MicIcon fontSize="inherit" />}
        </IconButton>
        <IconButton
          aria-label={transcriptLabel}
          aria-expanded={transcriptOpen}
          color={transcriptOpen ? "secondary" : "default"}
          data-testid="transcript-toggle"
          onClick={(event) => {
            event.preventDefault();
            onToggleTranscript();
          }}
          size="large"
          className={styles.iconButton}
          title={transcriptLabel}
        >
          <SubjectIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          aria-label={themeLabel}
          aria-pressed={resolvedThemeMode === "dark"}
          className={styles.iconButton}
          color="default"
          disabled={themeDisabled}
          onClick={(event) => {
            event.preventDefault();
            if (themeDisabled) {
              return;
            }
            onToggleTheme?.();
          }}
          size="large"
          title={themeLabel}
        >
          {resolvedThemeMode === "dark" ? (
            <LightModeIcon fontSize="inherit" />
          ) : (
            <DarkModeIcon fontSize="inherit" />
          )}
        </IconButton>
        <span className={styles.halIndicatorWrapper}>
          <HalIndicator
            active={voiceActive}
            hasMetrics={voiceHasMetrics}
            level={voiceLevel}
          />
        </span>
      </div>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4500}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        message={null}
      >
        {feedback ? (
          <Alert
            elevation={3}
            severity={feedback.severity}
            variant="filled"
            onClose={handleSnackbarClose}
            data-testid="session-feedback"
          >
            {feedback.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
