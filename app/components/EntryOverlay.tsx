"use client";

import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import BoltIcon from "@mui/icons-material/Bolt";
import Typography from "@mui/material/Typography";
import { ConnectionStatus } from "./SessionControls";
import styles from "../chat-client.module.css";

type EntryOverlayProps = {
  status: ConnectionStatus;
  error: string | null;
  onConnect: () => void | Promise<void>;
};

const statusCopy: Record<ConnectionStatus, string> = {
  idle: "Start a realtime session",
  connecting: "Connecting to realtime session…",
  connected: "",
  error: "Tap to retry connection",
};

export function EntryOverlay({ status, error, onConnect }: EntryOverlayProps) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isError = status === "error";
  const copy = statusCopy[status] ?? "Start a realtime session";

  if (isConnected) {
    return null;
  }

  return (
    <div className={styles.entryOverlay} data-visible={!isConnected}>
      <Tooltip title={isConnecting ? "Connecting…" : "Connect"} placement="top">
        <span>
          <IconButton
            className={styles.entryButton}
            aria-label={isConnecting ? "Connecting" : "Start voice session"}
            size="large"
            disabled={isConnecting}
            onClick={(event) => {
              event.preventDefault();
              if (isConnecting) {
                return;
              }
              void onConnect();
            }}
          >
            {isConnecting ? (
              <CircularProgress size="3.5rem" thickness={3.5} />
            ) : (
              <BoltIcon sx={{ fontSize: "3.5rem" }} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Typography variant="h6" className={styles.entryHint} component="p">
        {copy}
      </Typography>
      {isError && error ? (
        <Typography variant="body2" className={styles.entryError} role="alert">
          {error}
        </Typography>
      ) : null}
    </div>
  );
}
