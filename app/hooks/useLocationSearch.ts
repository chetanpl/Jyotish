"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BirthLocation, LocationSuggestion } from "@/lib/astro-ui";
import {
  extractLocationSuggestions,
  getTimezoneFromCoordinates,
} from "./../../lib/astro-location";
import type {
  BirthProfileState,
  UpdateBirthProfile,
} from "./../components/astro/types";

export type LocationPopupPosition = {
  top: number;
  left: number;
  width: number;
};

type Options = {
  profile: BirthProfileState;
  updateProfile: UpdateBirthProfile;
  /** Called whenever the user interacts with the location field (clears validation errors). */
  onInteraction: () => void;
  /** Optional ISO country code (e.g. "in") to restrict the search. */
  country?: string;
};

/* ------------------------------------------------------------------ */
/* REQUEST CONTROL SETTINGS                                            */
/* ------------------------------------------------------------------ */

const SEARCH_URL = "/api/location/search";
const MIN_QUERY_LENGTH = 3; // route.ts bhi 3 se kam par kuch nahi deta
const DEBOUNCE_MS = 500; // typing rukne ke itni der baad hi request
const COOLDOWN_MS = 60_000; // 403/429 aane par itni der koi request nahi
const CACHE_LIMIT = 50;

const BUSY_MESSAGE =
  "Location service is busy. Please try again in a minute.";
const FAILED_MESSAGE = "Could not search locations. Please try again.";

export function useLocationSearch({
  profile,
  updateProfile,
  onInteraction,
  country,
}: Options) {
  const [locationText, setLocationText] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPopupPosition, setLocationPopupPosition] =
    useState<LocationPopupPosition | null>(null);

  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const locationAbortRef = useRef<AbortController | null>(null);

  /*
   * Once the user selects a location, suppress location searching
   * until the user explicitly edits the field again.
   */
  const locationSearchSuppressedRef = useRef(false);

  /* Same query dobara type karne par server ko request nahi jayegi. */
  const cacheRef = useRef(new Map<string, LocationSuggestion[]>());

  /* Server 403/429 de to is time tak koi request nahi. */
  const blockedUntilRef = useRef(0);

  const locationValue = locationText || profile.placeOfBirth?.displayName || "";

  const locationSelected = profile.placeOfBirth !== null;

  const updateLocationPopupPosition = useCallback((): void => {
    const inputElement = locationInputRef.current;

    if (!inputElement) {
      return;
    }

    const rect = inputElement.getBoundingClientRect();

    setLocationPopupPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  /*
   * Location search (debounced, abortable, cached, rate-limit aware).
   *
   * Timezone lookup is NOT done here.
   */
  useEffect(() => {
    const query = locationText.trim();

    if (
      locationSearchSuppressedRef.current ||
      query.length < MIN_QUERY_LENGTH ||
      profile.placeOfBirth !== null
    ) {
      return;
    }

    const cacheKey = `${country ?? ""}|${query.toLowerCase()}`;

    /* 1) Cache hit: request nahi bhejni. */
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      setSuggestions(cached);
      setLocationLoading(false);
      setLocationError(null);

      if (cached.length > 0) {
        updateLocationPopupPosition();
      } else {
        setLocationPopupPosition(null);
      }

      return;
    }

    /* 2) Cooldown: server ne block kiya tha, hammer mat karo. */
    if (Date.now() < blockedUntilRef.current) {
      setSuggestions([]);
      setLocationLoading(false);
      setLocationPopupPosition(null);
      setLocationError(BUSY_MESSAGE);
      return;
    }

    const controller = new AbortController();

    locationAbortRef.current = controller;

    const showError = (message: string): void => {
      setSuggestions([]);
      setLocationLoading(false);
      setLocationPopupPosition(null);
      setLocationError(message);
    };

    const timeoutId = window.setTimeout(async () => {
      if (locationSearchSuppressedRef.current || controller.signal.aborted) {
        return;
      }

      try {
        const params = new URLSearchParams({ q: query });

        if (country) {
          params.set("country", country);
        }

        const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted || locationSearchSuppressedRef.current) {
          return;
        }

        if (response.status === 403 || response.status === 429) {
          blockedUntilRef.current = Date.now() + COOLDOWN_MS;
          showError(BUSY_MESSAGE);
          return;
        }

        if (!response.ok) {
          showError(FAILED_MESSAGE);
          return;
        }

        const payload: unknown = await response.json();

        if (controller.signal.aborted || locationSearchSuppressedRef.current) {
          return;
        }

        const normalized = extractLocationSuggestions(payload);

        /* Cache mein save (purana entry hata kar limit rakho). */
        if (cacheRef.current.size >= CACHE_LIMIT) {
          const oldest = cacheRef.current.keys().next().value;

          if (oldest !== undefined) {
            cacheRef.current.delete(oldest);
          }
        }

        cacheRef.current.set(cacheKey, normalized);

        setSuggestions(normalized);
        setLocationLoading(false);
        setLocationError(null);

        if (normalized.length > 0) {
          updateLocationPopupPosition();
        } else {
          setLocationPopupPosition(null);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        console.error("Location search failed:", error);

        showError(FAILED_MESSAGE);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);

      controller.abort();

      if (locationAbortRef.current === controller) {
        locationAbortRef.current = null;
      }
    };
  }, [locationText, profile.placeOfBirth, country, updateLocationPopupPosition]);

  /*
   * Keep location dropdown positioned correctly.
   */
  useEffect(() => {
    if (suggestions.length === 0) {
      return;
    }

    const handleViewportChange = (): void => {
      updateLocationPopupPosition();
    };

    window.addEventListener("resize", handleViewportChange);

    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);

      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [suggestions.length, updateLocationPopupPosition]);

  /*
   * Cleanup location request on unmount.
   */
  useEffect(() => {
    return () => {
      locationAbortRef.current?.abort();
    };
  }, []);

  /*
   * Location typing.
   */
  function handleLocationChange(value: string): void {
    // Manual typing means the user intentionally
    // wants to search again.
    locationSearchSuppressedRef.current = false;

    locationAbortRef.current?.abort();
    locationAbortRef.current = null;

    setLocationText(value);
    setSuggestions([]);
    setLocationPopupPosition(null);
    setLocationError(null);

    onInteraction();

    /*
     * Editing a previously selected location
     * invalidates the old selection.
     */
    if (profile.placeOfBirth !== null) {
      updateProfile("placeOfBirth", null);
    }

    if (value.trim().length >= MIN_QUERY_LENGTH) {
      setLocationLoading(true);

      window.requestAnimationFrame(() => {
        updateLocationPopupPosition();
      });
    } else {
      setLocationLoading(false);
    }
  }

  /*
   * Select location.
   *
   * There is NO /api/location/timezone request here.
   * The timezone is calculated locally from latitude + longitude.
   */
  async function selectLocation(suggestion: LocationSuggestion): Promise<void> {
    // Immediately suppress any pending/new
    // search triggered by this selection.
    locationSearchSuppressedRef.current = true;

    locationAbortRef.current?.abort();
    locationAbortRef.current = null;

    setSuggestions([]);
    setLocationPopupPosition(null);
    setLocationLoading(true);
    setLocationError(null);

    onInteraction();

    try {
      const timezone = getTimezoneFromCoordinates(
        suggestion.latitude,
        suggestion.longitude,
      );

      const selected: BirthLocation = {
        placeId: suggestion.placeId,
        name: suggestion.name,
        displayName: suggestion.displayName,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        timezone,
        timezoneId: timezone,
      };

      /*
       * Makes the location a valid selected
       * BirthLocation for chat validation.
       */
      updateProfile("placeOfBirth", selected);

      /*
       * Clear only the temporary search text.
       * locationValue will then use:
       *
       * profile.placeOfBirth.displayName
       */
      setLocationText("");
      setSuggestions([]);
      setLocationPopupPosition(null);
      setLocationError(null);

      onInteraction();
    } catch (error: unknown) {
      console.error("selectLocation failed:", error);

      /*
       * Keep the chosen suggestion visible
       * without triggering another search.
       */
      setLocationText(suggestion.displayName);

      setSuggestions([]);
      setLocationPopupPosition(null);

      setLocationError(
        error instanceof Error
          ? error.message
          : "Unable to determine the timezone for this location.",
      );
    } finally {
      setLocationLoading(false);
    }
  }

  return {
    locationInputRef,
    locationValue,
    locationSelected,
    locationLoading,
    locationError,
    suggestions,
    locationPopupPosition,
    handleLocationChange,
    selectLocation,
  };
}