"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  formatTime12Hour,
  getUiText,
  isAnswerLanguage,
  isMeridiem,
  setTimeFrom12Hour,
  validateChatRequest,
  type AnswerLanguage,
  type BirthLocation,
  type ChatResponse,
  type LocationSuggestion,
  type Message,
  type TimezoneResponse,
  type ValidationKey,
} from "@/lib/astro-ui";
import { useBirthProfile } from "@/lib/astro-profile-store";
import {
  ASTRO_MUSIC_ENABLED,
  ASTRO_MUSIC_VOLUME,
} from "@/lib/astro-client-config";

type LocationPopupPosition = {
  top: number;
  left: number;
  width: number;
};

const MUSIC_STORAGE_KEY =
  "pal-jyotish-ai-music-enabled";

function extractLocationSuggestions(
  payload: unknown,
): LocationSuggestion[] {
  let items: unknown[] = [];

  if (Array.isArray(payload)) {
    items = payload;
  } else if (
    typeof payload === "object" &&
    payload !== null
  ) {
    const object =
      payload as Record<string, unknown>;

    if (Array.isArray(object.suggestions)) {
      items = object.suggestions;
    } else if (Array.isArray(object.results)) {
      items = object.results;
    } else if (
      typeof object.data === "object" &&
      object.data !== null
    ) {
      const data =
        object.data as Record<string, unknown>;

      if (Array.isArray(data.suggestions)) {
        items = data.suggestions;
      } else if (Array.isArray(data.results)) {
        items = data.results;
      }
    }
  }

  return items.flatMap(
    (item): LocationSuggestion[] => {
      if (
        typeof item !== "object" ||
        item === null
      ) {
        return [];
      }

      const source =
        item as Record<string, unknown>;

      const placeIdValue =
        source.placeId ??
        source.place_id ??
        source.id;

      const nameValue =
        source.name ??
        source.displayName ??
        source.display_name ??
        source.label;

      const displayNameValue =
        source.displayName ??
        source.display_name ??
        source.label ??
        source.name;

      const latitudeValue =
        source.latitude ??
        source.lat;

      const longitudeValue =
        source.longitude ??
        source.lon ??
        source.lng;

      const placeId =
        typeof placeIdValue === "string"
          ? placeIdValue
          : typeof placeIdValue === "number"
            ? String(placeIdValue)
            : "";

      const name =
        typeof nameValue === "string"
          ? nameValue
          : "";

      const displayName =
        typeof displayNameValue === "string"
          ? displayNameValue
          : "";

      const latitude =
        typeof latitudeValue === "number"
          ? latitudeValue
          : Number(latitudeValue);

      const longitude =
        typeof longitudeValue === "number"
          ? longitudeValue
          : Number(longitudeValue);

      if (
        !placeId ||
        !name ||
        !displayName ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return [];
      }

      return [
        {
          placeId,
          name,
          displayName,
          latitude,
          longitude,
        },
      ];
    },
  );
}

export default function Home() {
  const [profile, updateProfile] =
    useBirthProfile();

  const [locationText, setLocationText] =
    useState("");

  const [suggestions, setSuggestions] =
    useState<LocationSuggestion[]>([]);

  const [locationLoading, setLocationLoading] =
    useState(false);

  const [locationPopupPosition, setLocationPopupPosition] =
    useState<LocationPopupPosition | null>(
      null,
    );

  const [input, setInput] =
    useState("");

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [sending, setSending] =
    useState(false);

  const [language, setLanguage] =
    useState<AnswerLanguage>("hi");

  const [showProfile, setShowProfile] =
    useState(true);

  const [validationMessage, setValidationMessage] =
    useState<ValidationKey | null>(null);

  const locationInputRef =
    useRef<HTMLInputElement | null>(null);

  const locationAbortRef =
    useRef<AbortController | null>(null);

  /*
  |--------------------------------------------------------------------------
  | Music
  |--------------------------------------------------------------------------
  */

  const musicRef =
    useRef<HTMLAudioElement | null>(null);

  const musicStartedRef =
    useRef(false);

  const firstInteractionHandledRef =
    useRef(false);

  const [musicPlaying, setMusicPlaying] =
    useState(false);

  /*
   * Important:
   *
   * null = preference has not been read yet
   * true = user wants music ON
   * false = user explicitly turned music OFF
   */
  const [musicEnabled, setMusicEnabled] =
    useState<boolean | null>(null);

  const timeParts =
    formatTime12Hour(
      profile.timeOfBirth,
    );

  const t =
    getUiText(language);

  const locationValue =
    locationText ||
    profile.placeOfBirth?.displayName ||
    "";

  const locationSelected =
    profile.placeOfBirth !== null &&
    locationText === "";

  const updateLocationPopupPosition =
    useCallback((): void => {
      const inputElement =
        locationInputRef.current;

      if (!inputElement) {
        return;
      }

      const rect =
        inputElement.getBoundingClientRect();

      setLocationPopupPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }, []);

  /*
  |--------------------------------------------------------------------------
  | Location search
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const query =
      locationText.trim();

    if (
      query.length < 2 ||
      locationSelected
    ) {
      return;
    }

    const controller =
      new AbortController();

    locationAbortRef.current =
      controller;

    const timeoutId =
      window.setTimeout(
        async () => {
          try {
            const response =
              await fetch(
                `/api/location/search?q=${encodeURIComponent(
                  query,
                )}`,
                {
                  method: "GET",
                  headers: {
                    Accept:
                      "application/json",
                  },
                  signal:
                    controller.signal,
                },
              );

            if (
              controller.signal.aborted
            ) {
              return;
            }

            if (!response.ok) {
              setSuggestions([]);
              setLocationLoading(false);
              setLocationPopupPosition(
                null,
              );
              return;
            }

            const payload: unknown =
              await response.json();

            if (
              controller.signal.aborted
            ) {
              return;
            }

            const normalized =
              extractLocationSuggestions(
                payload,
              );

            setSuggestions(
              normalized,
            );

            setLocationLoading(false);

            if (
              normalized.length > 0
            ) {
              updateLocationPopupPosition();
            } else {
              setLocationPopupPosition(
                null,
              );
            }
          } catch (error: unknown) {
            if (
              error instanceof DOMException &&
              error.name ===
              "AbortError"
            ) {
              return;
            }

            if (
              controller.signal.aborted
            ) {
              return;
            }

            setSuggestions([]);
            setLocationLoading(false);
            setLocationPopupPosition(
              null,
            );
          }
        },
        450,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );

      controller.abort();

      if (
        locationAbortRef.current ===
        controller
      ) {
        locationAbortRef.current =
          null;
      }
    };
  }, [
    locationText,
    locationSelected,
    updateLocationPopupPosition,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Keep location dropdown positioned correctly
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      suggestions.length === 0
    ) {
      return;
    }

    const handleViewportChange =
      (): void => {
        updateLocationPopupPosition();
      };

    window.addEventListener(
      "resize",
      handleViewportChange,
    );

    window.addEventListener(
      "scroll",
      handleViewportChange,
      true,
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleViewportChange,
      );

      window.removeEventListener(
        "scroll",
        handleViewportChange,
        true,
      );
    };
  }, [
    suggestions.length,
    updateLocationPopupPosition,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Cleanup location request
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      locationAbortRef.current?.abort();
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Read music preference
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      !ASTRO_MUSIC_ENABLED ||
      typeof window === "undefined"
    ) {
      setMusicEnabled(false);
      return;
    }

    try {
      const saved =
        window.localStorage.getItem(
          MUSIC_STORAGE_KEY,
        );

      /*
       * IMPORTANT:
       *
       * Only an explicit "false" means the user
       * has turned music OFF.
       *
       * If there is no saved preference, default
       * to ON for a first-time visitor.
       */
      setMusicEnabled(
        saved !== "false",
      );
    } catch {
      setMusicEnabled(true);
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Background Om Music
  |--------------------------------------------------------------------------
  |
  | Behaviour:
  |
  | - First-time visitor:
  |     page load -> try autoplay
  |
  | - If browser blocks autoplay:
  |     first user interaction -> play
  |
  | - If user previously turned OFF:
  |     page load -> NO music
  |     click anywhere -> NO music
  |     field click -> NO music
  |     typing -> NO music
  |
  | - User must explicitly press the music
  |   button to turn it ON again.
  |
  */

  useEffect(() => {
    if (
      !ASTRO_MUSIC_ENABLED ||
      typeof window === "undefined"
    ) {
      return;
    }

    /*
     * Do absolutely nothing while the preference
     * is still being read.
     */
    if (musicEnabled === null) {
      return;
    }

    const audio =
      musicRef.current;

    if (!audio) {
      return;
    }

    audio.loop = true;
    audio.preload = "auto";

    audio.volume = Math.min(
      1,
      Math.max(
        0,
        ASTRO_MUSIC_VOLUME,
      ),
    );

    const handlePlay =
      (): void => {
        musicStartedRef.current =
          true;

        setMusicPlaying(true);
      };

    const handlePause =
      (): void => {
        setMusicPlaying(false);
      };

    const handleEnded =
      (): void => {
        musicStartedRef.current =
          false;

        setMusicPlaying(false);
      };

    audio.addEventListener(
      "play",
      handlePlay,
    );

    audio.addEventListener(
      "pause",
      handlePause,
    );

    audio.addEventListener(
      "ended",
      handleEnded,
    );

    /*
     * ==========================================================
     * USER HAS MUSIC OFF
     * ==========================================================
     *
     * Absolutely no autoplay.
     * Absolutely no first-click playback.
     */
    if (!musicEnabled) {
      audio.pause();

      musicStartedRef.current =
        false;

      setMusicPlaying(false);

      return () => {
        audio.removeEventListener(
          "play",
          handlePlay,
        );

        audio.removeEventListener(
          "pause",
          handlePause,
        );

        audio.removeEventListener(
          "ended",
          handleEnded,
        );
      };
    }

    /*
     * ==========================================================
     * USER HAS MUSIC ON
     * ==========================================================
     */

    firstInteractionHandledRef.current =
      false;

    /*
     * Try to play immediately when page loads.
     */
    const tryStartMusic =
      (): void => {
        /*
         * Double protection:
         *
         * Never start if the preference has
         * changed to OFF.
         */
        if (
          musicEnabled !== true ||
          musicStartedRef.current
        ) {
          return;
        }

        void audio
          .play()
          .then(() => {
            /*
             * Re-check preference after play()
             * resolves. This prevents a stale
             * promise from starting music after
             * the user has switched it OFF.
             */
            if (
              musicEnabled !== true
            ) {
              audio.pause();

              return;
            }

            musicStartedRef.current =
              true;

            setMusicPlaying(true);
          })
          .catch(() => {
            /*
             * Autoplay can be blocked by browser.
             *
             * First user interaction handler
             * below will try once.
             */
          });
      };

    /*
     * Page-load autoplay attempt.
     */
    tryStartMusic();

    /*
     * ==========================================================
     * FIRST USER INTERACTION FALLBACK
     * ==========================================================
     *
     * This runs ONLY when music preference is ON.
     *
     * If user previously turned music OFF,
     * this listener is never installed.
     */
    const handleFirstInteraction =
      (): void => {
        if (
          firstInteractionHandledRef.current
        ) {
          return;
        }

        firstInteractionHandledRef.current =
          true;

        /*
         * Preference is still ON here.
         */
        tryStartMusic();

        /*
         * Remove immediately so subsequent clicks
         * never call play() again.
         */
        window.removeEventListener(
          "pointerdown",
          handleFirstInteraction,
        );

        window.removeEventListener(
          "keydown",
          handleFirstInteraction,
        );

        window.removeEventListener(
          "touchstart",
          handleFirstInteraction,
        );
      };

    window.addEventListener(
      "pointerdown",
      handleFirstInteraction,
      {
        passive: true,
      },
    );

    window.addEventListener(
      "keydown",
      handleFirstInteraction,
    );

    window.addEventListener(
      "touchstart",
      handleFirstInteraction,
      {
        passive: true,
      },
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        handleFirstInteraction,
      );

      window.removeEventListener(
        "keydown",
        handleFirstInteraction,
      );

      window.removeEventListener(
        "touchstart",
        handleFirstInteraction,
      );

      audio.removeEventListener(
        "play",
        handlePlay,
      );

      audio.removeEventListener(
        "pause",
        handlePause,
      );

      audio.removeEventListener(
        "ended",
        handleEnded,
      );
    };
  }, [
    musicEnabled,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Music ON / OFF
  |--------------------------------------------------------------------------
  */

  function handleMusicToggle(): void {
    const audio =
      musicRef.current;

    if (!audio) {
      return;
    }

    /*
     * ==========================================================
     * TURN MUSIC OFF
     * ==========================================================
     */

    if (musicPlaying) {
      /*
       * Stop immediately.
       */
      audio.pause();

      /*
       * Reset to beginning so the next manual
       * ON starts cleanly.
       */
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore currentTime errors.
      }

      musicStartedRef.current =
        false;

      setMusicPlaying(false);
      setMusicEnabled(false);

      /*
       * Save explicit OFF preference.
       */
      try {
        window.localStorage.setItem(
          MUSIC_STORAGE_KEY,
          "false",
        );
      } catch {
        // Ignore localStorage errors.
      }

      return;
    }

    /*
     * ==========================================================
     * TURN MUSIC ON
     * ==========================================================
     */

    setMusicEnabled(true);

    try {
      window.localStorage.setItem(
        MUSIC_STORAGE_KEY,
        "true",
      );
    } catch {
      // Ignore localStorage errors.
    }

    audio.volume = Math.min(
      1,
      Math.max(
        0,
        ASTRO_MUSIC_VOLUME,
      ),
    );

    /*
     * Reset first-interaction state because the
     * user has explicitly enabled music.
     */
    firstInteractionHandledRef.current =
      true;

    void audio
      .play()
      .then(() => {
        musicStartedRef.current =
          true;

        setMusicPlaying(true);
      })
      .catch(() => {
        /*
         * Direct button click normally satisfies
         * browser autoplay requirements.
         */
      });
  }

  /*
  |--------------------------------------------------------------------------
  | Profile helpers
  |--------------------------------------------------------------------------
  */

  function handleProfileChange<
    K extends keyof typeof profile,
  >(
    key: K,
    value: (typeof profile)[K],
  ): void {
    updateProfile(
      key,
      value,
    );

    setValidationMessage(
      null,
    );
  }

  function handleLocationChange(
    value: string,
  ): void {
    locationAbortRef.current?.abort();
    locationAbortRef.current =
      null;

    setLocationText(value);
    setSuggestions([]);
    setLocationPopupPosition(null);
    setValidationMessage(null);

    if (
      profile.placeOfBirth !== null
    ) {
      updateProfile(
        "placeOfBirth",
        null,
      );
    }

    const trimmed =
      value.trim();

    if (
      trimmed.length >= 2
    ) {
      setLocationLoading(
        true,
      );

      window.requestAnimationFrame(
        () => {
          updateLocationPopupPosition();
        },
      );
    } else {
      setLocationLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Select location
  |--------------------------------------------------------------------------
  */

  async function selectLocation(
    suggestion: LocationSuggestion,
  ): Promise<void> {
    locationAbortRef.current?.abort();
    locationAbortRef.current =
      null;

    setSuggestions([]);
    setLocationPopupPosition(
      null,
    );
    setLocationLoading(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/location/timezone",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              latitude:
                suggestion.latitude,
              longitude:
                suggestion.longitude,
            }),
          },
        );

      if (!response.ok) {
        throw new Error(
          t.errors.timezone,
        );
      }

      const data =
        (await response.json()) as TimezoneResponse;

      const timezoneId =
        typeof data.timezoneId ===
          "string"
          ? data.timezoneId.trim()
          : "";

      const timezone =
        typeof data.timezone ===
          "string"
          ? data.timezone.trim()
          : timezoneId;

      if (!timezone) {
        throw new Error(
          t.errors.timezone,
        );
      }

      const selected: BirthLocation = {
        placeId:
          suggestion.placeId,

        name:
          suggestion.name,

        displayName:
          suggestion.displayName,

        latitude:
          suggestion.latitude,

        longitude:
          suggestion.longitude,

        timezone,

        timezoneId:
          timezoneId ||
          timezone,
      };

      updateProfile(
        "placeOfBirth",
        selected,
      );

      setLocationText("");
      setSuggestions([]);
      setLocationPopupPosition(
        null,
      );
      setValidationMessage(
        null,
      );
    } catch (error: unknown) {
      setSuggestions([]);
      setLocationPopupPosition(
        null,
      );

      setLocationText(
        suggestion.displayName,
      );

      updateProfile(
        "placeOfBirth",
        null,
      );

      if (
        error instanceof Error
      ) {
        setValidationMessage(
          null,
        );
      }
    } finally {
      setLocationLoading(
        false,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Chat helpers
  |--------------------------------------------------------------------------
  */

  function canSend(): boolean {
    return (
      validateChatRequest(
        profile,
        input,
      ) === null &&
      !sending
    );
  }

  async function sendMessage(): Promise<void> {
    if (sending) {
      return;
    }

    const question =
      input.trim();

    const validationKey =
      validateChatRequest(
        profile,
        question,
      );

    if (
      validationKey !== null
    ) {
      setValidationMessage(
        validationKey,
      );

      return;
    }

    const userMessage: Message = {
      role: "user",
      content: question,
    };

    const updatedMessages: Message[] =
      [
        ...messages,
        userMessage,
      ];

    setMessages(
      updatedMessages,
    );

    setInput("");
    setValidationMessage(
      null,
    );
    setSending(true);

    try {
      const response =
        await fetch(
          "/api/chat",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body:
              JSON.stringify({
                profile,
                messages:
                  updatedMessages,
                language,
              }),
          },
        );

      const data =
        (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
          t.errors.chat,
        );
      }

      const answer =
        typeof data.message ===
          "string"
          ? data.message
          : t.errors.emptyAnswer;

      setMessages(
        (current) => [
          ...current,
          {
            role: "assistant",
            content:
              answer,
          },
        ],
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t.errors.generic;

      setMessages(
        (current) => [
          ...current,
          {
            role: "assistant",
            content:
              errorMessage,
          },
        ],
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }
  }

  const validationText =
    validationMessage === null
      ? null
      : t.validation[
      validationMessage
      ];

  const selectedLocation =
    profile.placeOfBirth;

  /*
  |--------------------------------------------------------------------------
  | Location suggestions portal
  |--------------------------------------------------------------------------
  */

  const locationPopup =
    suggestions.length > 0 &&
      locationPopupPosition !== null &&
      typeof document !==
      "undefined"
      ? createPortal(
        <div
          id="astro-location-list"
          className="astro-suggestions fixed z-[99999] overflow-hidden rounded-xl border border-[#ded8ce] bg-white p-1 shadow-[0_18px_45px_rgba(54,43,29,0.18)]"
          style={{
            top:
              locationPopupPosition.top,
            left:
              locationPopupPosition.left,
            width:
              locationPopupPosition.width,
          }}
          role="listbox"
          aria-label={
            t.profile.placeOfBirth
          }
        >
          {suggestions.map(
            (suggestion) => (
              <button
                key={
                  suggestion.placeId
                }
                type="button"
                role="option"
                onClick={() =>
                  void selectLocation(
                    suggestion,
                  )
                }
                className="astro-suggestion-item block w-full rounded-lg px-3 py-3 text-left"
              >
                <p className="text-sm font-medium text-[#394253]">
                  {
                    suggestion.name
                  }
                </p>

                <p className="mt-1 text-[11px] leading-4 text-[#8b94a2]">
                  {
                    suggestion.displayName
                  }
                </p>
              </button>
            ),
          )}
        </div>,
        document.body,
      )
      : null;

  return (
    <>
      <main className="astro-page min-h-screen overflow-hidden text-[#273142]">
        <div
          className="astro-background"
          aria-hidden="true"
        >
          <div className="astro-bg-orb astro-bg-orb-one" />
          <div className="astro-bg-orb astro-bg-orb-two" />
          <div className="astro-bg-orb astro-bg-orb-three" />
        </div>

        <div className="relative z-10">
          {/* ---------------------------------------------------------------- */}
          {/* Header */}
          {/* ---------------------------------------------------------------- */}

          <header className="astro-header border-b border-[#e7e2d9]/80 bg-[#faf9f6]/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="astro-logo flex h-11 w-11 items-center justify-center rounded-xl bg-[#6b4f8a] text-xl text-white shadow-sm">
                  ॐ
                </div>

                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-[#303746]">
                    Pal Jyotish AI
                  </h1>

                  <p className="text-[11px] text-[#8a93a3]">
                    {t.header.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                {/* ========================================================== */}
                {/* Music Button */}
                {/* ========================================================== */}

                {ASTRO_MUSIC_ENABLED && (
                  <button
                    type="button"
                    onClick={
                      handleMusicToggle
                    }
                    className={`mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${musicPlaying
                        ? "border-[#6b4f8a]/30 bg-[#6b4f8a]/10 text-[#6b4f8a]"
                        : "border-[#ddd7cd] bg-white text-[#8a93a3] hover:border-[#6b4f8a]/30 hover:text-[#6b4f8a]"
                      }`}
                    aria-label={
                      musicPlaying
                        ? language ===
                          "hi"
                          ? "संगीत बंद करें"
                          : "Turn music off"
                        : language ===
                          "hi"
                          ? "संगीत चालू करें"
                          : "Turn music on"
                    }
                    title={
                      musicPlaying
                        ? language ===
                          "hi"
                          ? "संगीत बंद करें"
                          : "Turn music off"
                        : language ===
                          "hi"
                          ? "संगीत चालू करें"
                          : "Turn music on"
                    }
                    aria-pressed={
                      musicPlaying
                    }
                  >
                    {musicPlaying ? (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 18V5L21 3V16"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        <circle
                          cx="6"
                          cy="18"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />

                        <circle
                          cx="18"
                          cy="16"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </svg>
                    ) : (
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M9 18V5L21 3V16"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          <circle
                            cx="6"
                            cy="18"
                            r="3"
                            stroke="currentColor"
                            strokeWidth="1.7"
                          />

                          <circle
                            cx="18"
                            cy="16"
                            r="3"
                            stroke="currentColor"
                            strokeWidth="1.7"
                          />
                        </svg>

                        <span
                          className="absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current"
                          aria-hidden="true"
                        />
                      </span>
                    )}
                  </button>
                )}

                <div className="hidden text-right sm:block">
                  <p className="text-xs font-medium text-[#5c6575]">
                    {t.header.metaTitle}
                  </p>

                  <p className="text-[10px] text-[#9aa1ad]">
                    {
                      t.header
                        .metaDescription
                    }
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* ---------------------------------------------------------------- */}
          {/* Actual Audio */}
          {/* ---------------------------------------------------------------- */}

          {ASTRO_MUSIC_ENABLED && (
            <audio
              ref={musicRef}
              src="/audio/om.mp3"
              loop
              preload="auto"
              aria-hidden="true"
            />
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Hero */}
          {/* ---------------------------------------------------------------- */}

          <section className="mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
            <div className="mx-auto max-w-3xl text-center">
              <div className="astro-shanti-badge mb-4 inline-flex items-center gap-2 rounded-full border border-[#6b4f8a]/30 px-4 py-2 text-xs text-[#5b426f]">
                <span className="astro-shanti-om text-base">
                  ॐ
                </span>

                <span className="whitespace-nowrap">
                  {t.hero.badge}
                </span>

                <span className="astro-shanti-om text-base">
                  ॐ
                </span>
              </div>

              <h2 className="astro-hero-title text-3xl font-semibold tracking-tight text-[#303746] sm:text-4xl">
                {language ===
                  "en" ? (
                  <>
                    {
                      t.hero
                        .titlePrefix
                    }{" "}
                    <span className="text-[#6b4f8a]">
                      {
                        t.hero
                          .titleAccent
                      }
                    </span>
                  </>
                ) : (
                  <>
                    {
                      t.hero
                        .titlePrefix
                    }{" "}
                    <span className="text-[#6b4f8a]">
                      {
                        t.hero
                          .titleAccent
                      }
                    </span>{" "}
                    {
                      t.hero
                        .titleSuffix
                    }
                  </>
                )}
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#737d8d] sm:text-base">
                {t.hero.description}
              </p>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Main */}
          {/* ---------------------------------------------------------------- */}

          <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 sm:px-8 lg:grid-cols-[380px_minmax(0,1fr)]">
            {/* ================================================================ */}
            {/* Profile */}
            {/* ================================================================ */}

            <aside className="astro-card rounded-2xl border border-[#e3ded5]/90 bg-[#faf9f6]/95 p-6 shadow-[0_8px_30px_rgba(67,53,34,0.07)] backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a8b78]">
                    {t.profile.eyebrow}
                  </p>

                  <h3 className="mt-1 text-lg font-semibold text-[#303746]">
                    {t.profile.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowProfile(
                      (current) =>
                        !current,
                    )
                  }
                  className="astro-button rounded-lg border border-[#ddd7cd] bg-white px-3 py-2 text-xs font-medium text-[#606979]"
                  aria-expanded={
                    showProfile
                  }
                >
                  {showProfile
                    ? t.profile.hide
                    : t.profile.show}
                </button>
              </div>

              {showProfile && (
                <div className="astro-profile-form mt-6 space-y-5">
                  {/* Name */}

                  <div className="astro-field">
                    <label
                      htmlFor="name"
                      className="mb-2 block text-xs font-medium text-[#4f596a]"
                    >
                      {t.profile.name}
                    </label>

                    <input
                      id="name"
                      type="text"
                      value={
                        profile.name
                      }
                      onChange={(event) =>
                        handleProfileChange(
                          "name",
                          event.target
                            .value,
                        )
                      }
                      placeholder={
                        t.profile
                          .namePlaceholder
                      }
                      className="astro-input w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </div>

                  {/* Gender */}

                  <div className="astro-field">
                    <label
                      htmlFor="gender"
                      className="mb-2 block text-xs font-medium text-[#4f596a]"
                    >
                      {t.profile.gender}
                    </label>

                    <select
                      id="gender"
                      value={
                        profile.gender
                      }
                      onChange={(event) =>
                        handleProfileChange(
                          "gender",
                          event.target
                            .value,
                        )
                      }
                      className="astro-input w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="">
                        {
                          t.profile
                            .genderPlaceholder
                        }
                      </option>

                      <option value="male">
                        {t.profile.male}
                      </option>

                      <option value="female">
                        {t.profile.female}
                      </option>

                      <option value="other">
                        {t.profile.other}
                      </option>
                    </select>
                  </div>

                  {/* ========================================================== */}
                  {/* Result Language */}
                  {/* ========================================================== */}

                  <div className="astro-field">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="answerLanguage"
                        className="block text-xs font-medium text-[#4f596a]"
                      >
                        {language ===
                          "hi"
                          ? "परिणाम की भाषा"
                          : "Result Language"}
                      </label>

                      <span className="text-[10px] text-[#9aa1ad]">
                        {language ===
                          "hi"
                          ? "भाषा चुनें"
                          : "Choose language"}
                      </span>
                    </div>

                    <div
                      id="answerLanguage"
                      role="group"
                      aria-label={
                        language ===
                          "hi"
                          ? "परिणाम की भाषा"
                          : "Result Language"
                      }
                      className="grid grid-cols-2 gap-1 rounded-xl border border-[#d8d2c7] bg-[#f5f2ed] p-1"
                    >
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => {
                          if (
                            isAnswerLanguage(
                              "hi",
                            )
                          ) {
                            setLanguage(
                              "hi",
                            );

                            setValidationMessage(
                              null,
                            );
                          }
                        }}
                        aria-pressed={
                          language ===
                          "hi"
                        }
                        className={`rounded-lg px-3 py-3 text-sm font-medium transition-all ${language ===
                            "hi"
                            ? "bg-white text-[#6b4f8a] shadow-sm ring-1 ring-[#6b4f8a]/10"
                            : "text-[#737d8d] hover:bg-white/70 hover:text-[#4f596a]"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="block">
                          हिंदी
                        </span>

                        <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                          Hindi
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => {
                          if (
                            isAnswerLanguage(
                              "en",
                            )
                          ) {
                            setLanguage(
                              "en",
                            );

                            setValidationMessage(
                              null,
                            );
                          }
                        }}
                        aria-pressed={
                          language ===
                          "en"
                        }
                        className={`rounded-lg px-3 py-3 text-sm font-medium transition-all ${language ===
                            "en"
                            ? "bg-white text-[#6b4f8a] shadow-sm ring-1 ring-[#6b4f8a]/10"
                            : "text-[#737d8d] hover:bg-white/70 hover:text-[#4f596a]"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="block">
                          English
                        </span>

                        <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                          English
                        </span>
                      </button>
                    </div>

                    <p className="mt-2 text-[10px] leading-4 text-[#98a0ad]">
                      {language ===
                        "hi"
                        ? "आप ज्योतिषीय परिणाम हिंदी या अंग्रेज़ी में प्राप्त कर सकते हैं।"
                        : "Choose whether your astrology results should be in English or Hindi."}
                    </p>
                  </div>

                  {/* Date of birth */}

                  <div className="astro-field">
                    <label
                      htmlFor="dateOfBirth"
                      className="mb-2 block text-xs font-medium text-[#4f596a]"
                    >
                      {
                        t.profile
                          .dateOfBirth
                      }
                    </label>

                    <input
                      id="dateOfBirth"
                      type="date"
                      value={
                        profile.dateOfBirth
                      }
                      onChange={(event) =>
                        handleProfileChange(
                          "dateOfBirth",
                          event.target
                            .value,
                        )
                      }
                      className="astro-input w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </div>

                  {/* Time of birth */}

                  <div className="astro-field">
                    <label className="mb-2 block text-xs font-medium text-[#4f596a]">
                      {
                        t.profile
                          .timeOfBirth
                      }
                    </label>

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <select
                        value={
                          timeParts.hour
                        }
                        onChange={(event) => {
                          const value =
                            event.target
                              .value;

                          if (
                            !/^\d{2}$/.test(
                              value,
                            )
                          ) {
                            return;
                          }

                          handleProfileChange(
                            "timeOfBirth",
                            setTimeFrom12Hour(
                              value,
                              timeParts.minute,
                              timeParts.period,
                            ),
                          );
                        }}
                        aria-label={
                          t.profile.hour
                        }
                        className="astro-input rounded-xl border border-[#d8d2c7] bg-white px-3 py-3 text-sm font-medium outline-none"
                      >
                        {Array.from(
                          { length: 12 },
                          (_, index) => {
                            const hour =
                              String(
                                index +
                                1,
                              ).padStart(
                                2,
                                "0",
                              );

                            return (
                              <option
                                key={
                                  hour
                                }
                                value={
                                  hour
                                }
                              >
                                {hour}
                              </option>
                            );
                          },
                        )}
                      </select>

                      <select
                        value={
                          timeParts.minute
                        }
                        onChange={(event) => {
                          const value =
                            event.target
                              .value;

                          if (
                            !/^\d{2}$/.test(
                              value,
                            )
                          ) {
                            return;
                          }

                          handleProfileChange(
                            "timeOfBirth",
                            setTimeFrom12Hour(
                              timeParts.hour,
                              value,
                              timeParts.period,
                            ),
                          );
                        }}
                        aria-label={
                          t.profile.minute
                        }
                        className="astro-input rounded-xl border border-[#d8d2c7] bg-white px-3 py-3 text-sm font-medium outline-none"
                      >
                        {Array.from(
                          { length: 60 },
                          (_, index) => {
                            const minute =
                              String(
                                index,
                              ).padStart(
                                2,
                                "0",
                              );

                            return (
                              <option
                                key={
                                  minute
                                }
                                value={
                                  minute
                                }
                              >
                                {minute}
                              </option>
                            );
                          },
                        )}
                      </select>

                      <select
                        value={
                          timeParts.period
                        }
                        onChange={(event) => {
                          const value =
                            event.target
                              .value;

                          if (
                            !isMeridiem(
                              value,
                            )
                          ) {
                            return;
                          }

                          handleProfileChange(
                            "timeOfBirth",
                            setTimeFrom12Hour(
                              timeParts.hour,
                              timeParts.minute,
                              value,
                            ),
                          );
                        }}
                        aria-label={
                          t.profile.period
                        }
                        className="astro-input rounded-xl border border-[#d8d2c7] bg-white px-3 py-3 text-sm font-medium outline-none"
                      >
                        <option value="AM">
                          {t.profile.am}
                        </option>

                        <option value="PM">
                          {t.profile.pm}
                        </option>
                      </select>
                    </div>

                    <p className="mt-2 text-[10px] text-[#98a0ad]">
                      {
                        t.profile
                          .timeHelper
                      }
                    </p>
                  </div>

                  {/* Place of birth */}

                  <div className="astro-field">
                    <label
                      htmlFor="placeOfBirth"
                      className="mb-2 block text-xs font-medium text-[#4f596a]"
                    >
                      {
                        t.profile
                          .placeOfBirth
                      }
                    </label>

                    <div className="relative z-20">
                      <input
                        ref={
                          locationInputRef
                        }
                        id="placeOfBirth"
                        type="text"
                        value={
                          locationValue
                        }
                        onChange={(event) =>
                          handleLocationChange(
                            event.target
                              .value,
                          )
                        }
                        placeholder={
                          t.profile
                            .placePlaceholder
                        }
                        autoComplete="off"
                        className={`astro-input w-full rounded-xl border bg-white px-4 py-3 pr-10 text-sm outline-none ${locationLoading
                            ? "border-[#6b4f8a]/50"
                            : locationSelected
                              ? "border-emerald-400/50"
                              : "border-[#d8d2c7]"
                          }`}
                        aria-autocomplete="list"
                        aria-expanded={
                          suggestions.length >
                          0
                        }
                        aria-controls="astro-location-list"
                      />

                      {locationLoading && (
                        <div
                          className="absolute right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center"
                          aria-hidden="true"
                        >
                          <span className="astro-loader-ring absolute h-7 w-7 rounded-full border border-[#6b4f8a]/20" />

                          <span className="astro-location-om relative flex h-7 w-7 items-center justify-center rounded-full bg-[#f8f4fb] text-sm text-[#6b4f8a]">
                            ॐ
                          </span>
                        </div>
                      )}

                      {!locationLoading &&
                        locationSelected && (
                          <div
                            className="astro-success absolute right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-xs text-emerald-600"
                            aria-hidden="true"
                          >
                            ✓
                          </div>
                        )}
                    </div>

                    <p className="mt-2 text-[10px] text-[#98a0ad]">
                      {
                        t.profile
                          .placeHelper
                      }
                    </p>
                  </div>

                  {/* Selected location */}

                  {selectedLocation && (
                    <div className="astro-location-card rounded-xl border border-[#e4ded4] bg-[#f8f6f1] p-4">
                      <div className="flex items-start gap-3">
                        <div className="astro-small-om flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6b4f8a]/10 text-sm text-[#6b4f8a]">
                          ॐ
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#4f596a]">
                            {
                              t.profile
                                .selectedTitle
                            }
                          </p>

                          <p className="mt-1 break-words text-xs leading-5 text-[#7c8594]">
                            {
                              selectedLocation.displayName
                            }
                          </p>

                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
                              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#a09a90]">
                                {
                                  t.profile
                                    .latitude
                                }
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#596274]">
                                {selectedLocation.latitude.toFixed(
                                  6,
                                )}
                              </p>
                            </div>

                            <div className="rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
                              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#a09a90]">
                                {
                                  t.profile
                                    .longitude
                                }
                              </p>

                              <p className="mt-1 text-xs font-semibold text-[#596274]">
                                {selectedLocation.longitude.toFixed(
                                  6,
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2 rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
                            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#a09a90]">
                              {
                                t.profile.timezone
                              }
                            </p>

                            <p className="mt-1 break-all text-xs font-semibold text-[#596274]">
                              {
                                selectedLocation
                                  .timezoneId ||
                                selectedLocation.timezone
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================== */}
                  {/* Privacy & Security */}
                  {/* ========================================================== */}

                  <div className="mt-5 rounded-xl border border-[#e3ded5] bg-[#f8f6f1] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 3L19 6V11C19 15.5 16.1 19.5 12 21C7.9 19.5 5 15.5 5 11V6L12 3Z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          <path
                            d="M9 12L11 14L15 10"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#4f596a]">
                          Your Privacy Matters
                        </p>

                        <p className="mt-1 text-[11px] leading-5 text-[#7c8594]">
                          We don’t store your
                          personal information
                          unnecessarily. Your
                          information is protected
                          with encryption while it
                          is being transmitted.
                        </p>

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center gap-2 text-[10px] text-[#737d8d]">
                            <span className="text-emerald-600">
                              ✓
                            </span>

                            <span>
                              No unnecessary
                              personal data
                              storage
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-[#737d8d]">
                            <span className="text-emerald-600">
                              ✓
                            </span>

                            <span>
                              Encrypted data
                              transmission
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-[#737d8d]">
                            <span className="text-emerald-600">
                              ✓
                            </span>

                            <span>
                              Your privacy is
                              our priority
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>

            {/* ================================================================ */}
            {/* Chat */}
            {/* ================================================================ */}

            <section className="astro-chat flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-[#e3ded5]/90 bg-white/95 shadow-[0_8px_30px_rgba(67,53,34,0.07)] backdrop-blur-sm">
              <div className="border-b border-[#e8e3da] bg-[#faf9f6]/95 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="astro-chat-om relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#6b4f8a] text-lg text-white">
                    ॐ
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[#303746]">
                      {t.chat.title}
                    </h3>

                    <p className="mt-0.5 text-[11px] text-[#8b94a2]">
                      {t.chat.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                {messages.length ===
                  0 && (
                    <div className="flex min-h-[420px] items-center justify-center">
                      <div className="max-w-md text-center">
                        <div className="astro-welcome-om mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6b4f8a]/10 text-3xl text-[#6b4f8a]">
                          ॐ
                        </div>

                        <h4 className="text-lg font-semibold text-[#3b4352]">
                          {
                            t.chat
                              .welcomeTitle
                          }
                        </h4>

                        <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
                          {
                            t.chat
                              .welcomeDescription
                          }
                        </p>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          {t.chat.quickQuestions.map(
                            (
                              question,
                            ) => (
                              <button
                                key={
                                  question
                                }
                                type="button"
                                onClick={() => {
                                  setInput(
                                    question,
                                  );

                                  setValidationMessage(
                                    null,
                                  );
                                }}
                                className="astro-chip rounded-full border border-[#ddd7cd] bg-[#faf9f6] px-3 py-2 text-xs text-[#697282]"
                              >
                                {
                                  question
                                }
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                {messages.map(
                  (
                    message,
                    index,
                  ) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`astro-message flex ${message.role ===
                          "user"
                          ? "justify-end"
                          : "justify-start"
                        }`}
                      style={{
                        animationDelay: `${Math.min(
                          index *
                          70,
                          500,
                        )}ms`,
                      }}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${message.role ===
                            "user"
                            ? "rounded-br-md bg-[#6b4f8a] text-white"
                            : "rounded-bl-md border border-[#e2ddd4] bg-[#f8f6f2] text-[#4d5666]"
                          }`}
                      >
                        <div className="whitespace-pre-wrap">
                          {
                            message.content
                          }
                        </div>
                      </div>
                    </div>
                  ),
                )}

                {sending && (
                  <div className="astro-thinking flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-[#d8d2c7] bg-[#f8f6f2] px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-8 w-8 items-center justify-center">
                          <span className="astro-thinking-ring absolute h-8 w-8 rounded-full border border-[#6b4f8a]/20" />

                          <span className="astro-thinking-om relative text-lg text-[#6b4f8a]">
                            ॐ
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-[#5b426f]">
                            {
                              t.chat
                                .thinkingTitle
                            }
                          </p>

                          <p className="mt-0.5 text-[10px] text-[#8a93a3]">
                            {
                              t.chat
                                .thinkingSubtitle
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ============================================================ */}
              {/* Chat input */}
              {/* ============================================================ */}

              <div className="border-t border-[#e8e3da] bg-[#faf9f6]/95 p-4 sm:p-5">
                <div className="flex items-end gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => {
                      setInput(
                        event.target
                          .value,
                      );

                      setValidationMessage(
                        null,
                      );
                    }}
                    onKeyDown={
                      handleKeyDown
                    }
                    disabled={sending}
                    rows={3}
                    placeholder={
                      t.chat.placeholder
                    }
                    className="astro-textarea min-h-[78px] flex-1 resize-none rounded-2xl border border-[#d8d2c7] bg-white px-4 py-3 text-sm leading-6 text-[#303746] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    aria-invalid={
                      validationMessage !==
                      null
                    }
                    aria-describedby={
                      validationText
                        ? "chat-validation"
                        : undefined
                    }
                  />

                  <button
                    type="button"
                    onClick={() =>
                      void sendMessage()
                    }
                    disabled={
                      !canSend()
                    }
                    className="astro-send-button flex h-[78px] w-14 shrink-0 items-center justify-center rounded-2xl bg-[#6b4f8a] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={
                      t.chat.send
                    }
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M22 2L11 13"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      <path
                        d="M22 2L15 22L11 13L2 9L22 2Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                {validationText && (
                  <p
                    id="chat-validation"
                    className="astro-validation mt-2 text-[11px] font-medium text-rose-600"
                  >
                    {validationText}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] leading-4 text-[#9aa1ad]">
                    {t.chat.keyboardHint}
                  </p>

                  <p className="astro-footer-om hidden text-[10px] text-[#aaa39a] sm:block">
                    {t.chat.footerOm}
                  </p>
                </div>
              </div>
            </section>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Footer */}
          {/* ---------------------------------------------------------------- */}

          <footer className="border-t border-[#ddd7cd] bg-[#f7f4ee]">
            <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="text-center lg:text-left">
                  <p className="text-xs font-medium leading-5 text-[#596273]">
                    {t.footer.description}
                  </p>

                  <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#737d8d]">
                    <span className="font-semibold text-[#565f70]">
                      {language ===
                        "hi"
                        ? "अस्वीकरण:"
                        : "Disclaimer:"}
                    </span>{" "}
                    {t.footer.disclaimer}
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center border-t border-[#ddd7cd] pt-4 lg:min-w-[220px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="astro-footer-om text-sm font-medium text-[#6b4f8a]">
                    {t.footer.right}
                  </p>

                  <p className="mt-2 text-sm font-bold tracking-wide text-[#4f596a]">
                    {t.footer.poweredBy}
                  </p>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </main>

      {locationPopup}
    </>
  );
}