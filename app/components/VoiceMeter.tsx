"use client";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

export type VoiceMeterProps = {
  active: boolean;
  level: number;
  hasMetrics: boolean;
};

const BAR_COUNT = 4;

export function VoiceMeter({ active, level, hasMetrics }: VoiceMeterProps) {
  const clampedLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));

  return (
    <Paper
      elevation={6}
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 168,
        pointerEvents: "auto",
      }}
      role="status"
      aria-label="Voice activity"
      aria-live="polite"
      data-testid="voice-meter"
    >
      <Typography variant="caption" color="text.secondary">
        Voice activity
      </Typography>

      {hasMetrics ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 0.5,
            height: 36,
          }}
          aria-hidden
        >
          {Array.from({ length: BAR_COUNT }).map((_, index) => {
            const step = (index + 1) / BAR_COUNT;
            const barActive = clampedLevel >= step;
            return (
              <Box
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                sx={{
                  flex: 1,
                  height: 18 + index * 6,
                  borderRadius: 1,
                  transition: "background-color 160ms ease, transform 160ms ease",
                  transform: barActive
                    ? `scaleY(${1 + clampedLevel * 0.15})`
                    : "scaleY(1)",
                  transformOrigin: "center bottom",
                  backgroundColor: (theme) =>
                    barActive
                      ? theme.palette.success.main
                      : alpha(theme.palette.success.light, 0.25),
                }}
              />
            );
          })}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Waiting for audio…
        </Typography>
      )}

      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            transition: "all 160ms ease",
            backgroundColor: (theme) =>
              active ? theme.palette.success.main : theme.palette.grey[400],
            boxShadow: (theme) =>
              active ? `0 0 0 4px ${alpha(theme.palette.success.light, 0.35)}` : "none",
          }}
        />
        <Typography
          variant="caption"
          color={active ? "success.main" : hasMetrics ? "text.secondary" : "text.disabled"}
          sx={{ fontWeight: 600 }}
        >
          {active ? "Speaking" : hasMetrics ? "Idle" : "Inactive"}
        </Typography>
      </Box>
    </Paper>
  );
}
