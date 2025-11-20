import { useEffect, useState } from "react";

/**
 * Creates a hidden, autoplaying audio element for realtime playback and
 * cleans it up on unmount. Keeps DOM concerns out of the main client.
 */
export function useHiddenAudioElement(): HTMLAudioElement | null {
  const [audioElement] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const element = document.createElement("audio");
    element.autoplay = true;
    (element as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    element.style.display = "none";
    document.body.appendChild(element);
    return element;
  });

  useEffect(() => {
    return () => {
      if (!audioElement) {
        return;
      }
      audioElement.srcObject = null;
      if (audioElement.isConnected) {
        audioElement.remove();
      }
    };
  }, [audioElement]);

  return audioElement;
}
