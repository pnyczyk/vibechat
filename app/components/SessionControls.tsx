"use client";

import { MouseEvent, SyntheticEvent } from "react";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Tooltip from "@mui/material/Tooltip";
import LogoutIcon from "@mui/icons-material/Logout";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import SubjectIcon from "@mui/icons-material/Subject";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import styles from "./controls.module.css";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type SessionFeedback = {
  message: string;
  severity: "success" | "error";
};

export type SessionControlsProps = {
  status: ConnectionStatus;
  onConnect: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  muted: boolean;
  onToggleMute: () => void;
  feedback: SessionFeedback | null;
  onFeedbackClose: () => void;
  voiceActive: boolean;
  voiceHasMetrics: boolean;
  transcriptOpen: boolean;
  onToggleTranscript: () => void;
  themeMode?: "light" | "dark";
  onToggleTheme?: (() => void) | null;
};

type VoiceActivityIndicatorProps = {
  active: boolean;
  hasMetrics: boolean;
};

function VoiceActivityIndicator({ active, hasMetrics }: VoiceActivityIndicatorProps) {
  const label = active
    ? "AI is speaking"
    : hasMetrics
      ? "AI is idle"
      : "Waiting for audio";

  return (
    <div
      className={styles.voiceIndicator}
      data-active={active ? "true" : "false"}
      data-ready={hasMetrics ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="voice-activity-indicator"
    >
      <span className={styles.voiceIndicatorCore} aria-hidden="true" />
      <span className={styles.srOnly}>
        {label}
      </span>
    </div>
  );
}

export function SessionControls({
  status,
  onConnect: _onConnect,
  onDisconnect,
  muted,
  onToggleMute,
  feedback,
  onFeedbackClose,
  voiceActive,
  voiceHasMetrics,
  transcriptOpen,
  onToggleTranscript,
  themeMode = "light",
  onToggleTheme,
}: SessionControlsProps) {
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";

  const micTooltip = !isConnected
    ? "Connect to enable microphone"
    : muted
      ? "Unmute microphone"
      : "Mute microphone";

  const transcriptTooltip = transcriptOpen
    ? "Close transcript drawer"
    : "Open transcript drawer";
  const resolvedThemeMode = themeMode === "dark" ? "dark" : "light";
  const themeTooltip =
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
          <Tooltip title="Disconnect session" placement="left">
            <span className={styles.iconWrapper}>
              <IconButton
                aria-label="Disconnect session"
                aria-pressed
                color={disconnectColor}
                onClick={handleDisconnectClick}
                size="large"
                className={styles.iconButton}
              >
                <LogoutIcon fontSize="inherit" />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
        <Tooltip title={micTooltip} placement="left">
          <span className={styles.iconWrapper}>
            <IconButton
              aria-label={micTooltip}
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
            >
              {muted ? (
                <MicOffIcon fontSize="inherit" />
              ) : (
                <MicIcon fontSize="inherit" />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={transcriptTooltip} placement="left">
          <span className={styles.iconWrapper}>
            <IconButton
              aria-label={transcriptTooltip}
              aria-expanded={transcriptOpen}
              color={transcriptOpen ? "secondary" : "default"}
              data-testid="transcript-toggle"
              onClick={(event) => {
                event.preventDefault();
                onToggleTranscript();
              }}
              size="large"
              className={styles.iconButton}
            >
              <SubjectIcon fontSize="inherit" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={themeTooltip} placement="left">
          <span className={styles.iconWrapper}>
            <IconButton
              aria-label={themeTooltip}
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
            >
              {resolvedThemeMode === "dark" ? (
                <LightModeIcon fontSize="inherit" />
              ) : (
                <DarkModeIcon fontSize="inherit" />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <VoiceActivityIndicator active={voiceActive} hasMetrics={voiceHasMetrics} />
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
