"use client";

import { MouseEvent, SyntheticEvent } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import { visuallyHidden } from "@mui/utils";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import PowerOffIcon from "@mui/icons-material/PowerOff";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";

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

  const Icon = active ? GraphicEqIcon : FiberManualRecordIcon;
  const color = active ? "success.main" : hasMetrics ? "text.secondary" : "text.disabled";

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="voice-activity-indicator"
      sx={{
        mt: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        backgroundColor: (theme) => theme.palette.action.hover,
        padding: "0.35rem 0.5rem",
      }}
    >
      <Icon
        fontSize="small"
        sx={{
          color,
          transition: "transform 180ms ease, color 180ms ease",
          transform: active ? "scale(1.1)" : "scale(0.9)",
        }}
      />
      <Box component="span" sx={visuallyHidden}>
        {label}
      </Box>
    </Box>
  );
}

export function SessionControls({
  status,
  onConnect,
  onDisconnect,
  muted,
  onToggleMute,
  feedback,
  onFeedbackClose,
  voiceActive,
  voiceHasMetrics,
}: SessionControlsProps) {
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";
  const isError = status === "error";

  const tooltipTitle = isConnected
    ? "Disconnect session"
    : isConnecting
      ? "Connecting…"
      : isError
        ? "Reconnect to session"
        : "Connect to session";

  const micTooltip = !isConnected
    ? "Connect to enable microphone"
    : muted
      ? "Unmute microphone"
      : "Mute microphone";

  const iconColor = isConnected ? "success" : isError ? "error" : "primary";
  const micColor = muted ? "error" : "primary";
  const micDisabled = !isConnected || isConnecting;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isConnecting) {
      return;
    }

    if (isConnected) {
      onDisconnect();
      return;
    }

    onConnect();
  };

  const handleSnackbarClose = (_: SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") {
      return;
    }
    onFeedbackClose();
  };

  return (
    <>
      <Stack
        direction="column"
        spacing={1}
        alignItems="center"
        data-testid="session-controls"
      >
        <Tooltip title={tooltipTitle} placement="left">
          <span>
            <IconButton
              aria-label={tooltipTitle}
              aria-pressed={isConnected}
              color={iconColor}
              disabled={isConnecting}
              onClick={handleClick}
              size="large"
            >
              {isConnecting ? (
                <CircularProgress
                  size={26}
                  role="progressbar"
                  aria-label="Connecting"
                />
              ) : isConnected ? (
                <PowerOffIcon fontSize="inherit" />
              ) : (
                <PowerSettingsNewIcon fontSize="inherit" />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={micTooltip} placement="left">
          <span>
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
            >
              {muted ? (
                <MicOffIcon fontSize="inherit" />
              ) : (
                <MicIcon fontSize="inherit" />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <VoiceActivityIndicator active={voiceActive} hasMetrics={voiceHasMetrics} />
      </Stack>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4500}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
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
        ) : null}
      </Snackbar>
    </>
  );
}
