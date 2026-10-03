"use client";

import { useEffect, useRef, useState } from "react";
import {
  ASTRO_MUSIC_ENABLED,
  ASTRO_MUSIC_VOLUME,
} from "./../../lib/astro-client-config";

const MUSIC_STORAGE_KEY = "pal-jyotish-ai-music-enabled";

const clampedVolume = (): number =>
  Math.min(1, Math.max(0, ASTRO_MUSIC_VOLUME));

export function useBackgroundMusic() {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicStartedRef = useRef(false);
  const musicEnabledRef = useRef<boolean | null>(null);
  const firstInteractionHandledRef = useRef(false);

  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState<boolean | null>(null);

  /* Read music preference */
  useEffect(() => {
    if (!ASTRO_MUSIC_ENABLED || typeof window === "undefined") {
      musicEnabledRef.current = false;
      setMusicEnabled(false);
      return;
    }

    try {
      const saved = window.localStorage.getItem(MUSIC_STORAGE_KEY);
      const enabled = saved !== "false";

      musicEnabledRef.current = enabled;
      setMusicEnabled(enabled);
    } catch {
      musicEnabledRef.current = true;
      setMusicEnabled(true);
    }
  }, []);

  /* Background Om music */
  useEffect(() => {
    if (!ASTRO_MUSIC_ENABLED || typeof window === "undefined") {
      return;
    }

    if (musicEnabled === null) {
      return;
    }

    const audio = musicRef.current;

    if (!audio) {
      return;
    }

    audio.loop = false;
    audio.preload = "auto";
    audio.volume = clampedVolume();

    const handlePlay = (): void => {
      setMusicPlaying(true);
    };

    const handlePause = (): void => {
      setMusicPlaying(false);
    };

    const handleEnded = (): void => {
      setMusicPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    if (!musicEnabled) {
      audio.pause();

      musicStartedRef.current = false;
      firstInteractionHandledRef.current = true;

      setMusicPlaying(false);

      return () => {
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handleEnded);
      };
    }

    firstInteractionHandledRef.current = false;

    const playMusicOnce = (): void => {
      if (musicStartedRef.current) {
        return;
      }

      if (musicEnabledRef.current !== true) {
        return;
      }

      musicStartedRef.current = true;

      void audio
        .play()
        .then(() => {
          if (musicEnabledRef.current !== true) {
            audio.pause();
            musicStartedRef.current = false;
            setMusicPlaying(false);
            return;
          }

          setMusicPlaying(true);
        })
        .catch(() => {
          musicStartedRef.current = false;
        });
    };

    playMusicOnce();

    const handleFirstInteraction = (): void => {
      if (firstInteractionHandledRef.current) {
        return;
      }

      firstInteractionHandledRef.current = true;

      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);

      playMusicOnce();
    };

    window.addEventListener("pointerdown", handleFirstInteraction, {
      passive: true,
    });
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);

      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [musicEnabled]);

  /* Music ON / OFF */
  function handleMusicToggle(): void {
    const audio = musicRef.current;

    if (!audio) {
      return;
    }

    if (musicPlaying) {
      audio.pause();

      try {
        audio.currentTime = 0;
      } catch {
        // Ignore currentTime errors.
      }

      musicStartedRef.current = false;
      musicEnabledRef.current = false;
      firstInteractionHandledRef.current = true;

      setMusicPlaying(false);
      setMusicEnabled(false);

      try {
        window.localStorage.setItem(MUSIC_STORAGE_KEY, "false");
      } catch {
        // Ignore localStorage errors.
      }

      return;
    }

    musicEnabledRef.current = true;

    setMusicEnabled(true);

    try {
      window.localStorage.setItem(MUSIC_STORAGE_KEY, "true");
    } catch {
      // Ignore localStorage errors.
    }

    audio.volume = clampedVolume();

    musicStartedRef.current = true;
    firstInteractionHandledRef.current = true;

    void audio
      .play()
      .then(() => {
        if (musicEnabledRef.current !== true) {
          audio.pause();
          musicStartedRef.current = false;
          setMusicPlaying(false);
          return;
        }

        setMusicPlaying(true);
      })
      .catch(() => {
        musicStartedRef.current = false;
        setMusicPlaying(false);
      });
  }

  return { musicRef, musicPlaying, handleMusicToggle };
}
