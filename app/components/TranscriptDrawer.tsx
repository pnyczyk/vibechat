"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import { alpha } from "@mui/material/styles";

import type { TranscriptEntry } from "../lib/transcript-store";

export type TranscriptDrawerProps = {
  open: boolean;
  onClose: () => void;
  entries: TranscriptEntry[];
  onSendMessage: (text: string) => void | Promise<void>;
  inputDisabled?: boolean;
};

export function TranscriptDrawer({
  open,
  onClose,
  entries,
  onSendMessage,
  inputDisabled = false,
}: TranscriptDrawerProps) {
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const latestEntryId = useMemo(
    () => (entries.length > 0 ? entries[entries.length - 1]!.id : null),
    [entries],
  );

  useEffect(() => {
    if (!open || !latestEntryId) {
      return;
    }

    const latestItem = listRef.current?.querySelector<HTMLElement>(
      `[data-transcript-entry-id="${latestEntryId}"]`,
    );

    if (latestItem && typeof latestItem.scrollIntoView === "function") {
      latestItem.scrollIntoView({ block: "nearest" });
    }
  }, [latestEntryId, open]);

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
    }
  }, [open]);

  const submitMessage = async () => {
    if (inputDisabled || isSubmitting) {
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      setSubmitError("Enter a message to send");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await onSendMessage(trimmed);
      setMessage("");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Failed to send message";
      setSubmitError(messageText);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const placeholder = inputDisabled
    ? "Connect to send a message"
    : "Type to send a message";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        role: "dialog",
        "aria-label": "Transcript drawer",
        sx: (theme) => ({
          width: "min(30vw, 420px)",
          backgroundColor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: "blur(12px)",
          borderLeft: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }),
      }}
    >
      <Stack spacing={2} sx={{ p: 2, height: "100%" }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="h2">
            Transcript
          </Typography>
          <Stack direction="row" sx={{ marginLeft: "auto" }}>
            <Tooltip title="Close transcript">
              <IconButton
                aria-label="Close transcript"
                edge="end"
                onClick={onClose}
                size="small"
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider />

        <List
          ref={listRef}
          sx={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
          data-testid="transcript-entries"
        >
          {entries.length === 0 ? (
            <ListItem disablePadding data-testid="transcript-empty">
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary">
                    Transcript will appear here once the session starts.
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            entries.map((entry) => (
              <ListItem
                key={entry.id}
                data-transcript-entry-id={entry.id}
                alignItems="flex-start"
                disablePadding
              >
                <ListItemText
                  primary={
                    <Typography variant="caption" color="text.secondary">
                      {entry.role === "user" ? "You" : "Assistant"}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{ whiteSpace: "pre-wrap" }}
                    >
                      {entry.text}
                    </Typography>
                  }
                />
              </ListItem>
            ))
          )}
        </List>

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Send a message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (submitError) {
                setSubmitError(null);
              }
            }}
            placeholder={placeholder}
            disabled={inputDisabled || isSubmitting}
            error={Boolean(submitError)}
            helperText={
              submitError ?? "Press Enter to send, Shift+Enter for a new line"
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Send message">
                    <span>
                      <IconButton
                        type="submit"
                        aria-label="Send message"
                        color="primary"
                        disabled={inputDisabled || isSubmitting}
                        edge="end"
                        size="small"
                      >
                        <SendIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ shrink: true }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitMessage();
              }
            }}
          />
        </form>

        {inputDisabled ? (
          <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
            Connect the session to send transcript messages.
          </Alert>
        ) : null}
      </Stack>
    </Drawer>
  );
}
