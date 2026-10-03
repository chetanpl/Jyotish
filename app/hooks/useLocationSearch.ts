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
};

export function useLocationSearch({
  profile,
  updateProfile,
  onInteraction,
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
   * Location search
   *
   * This still uses your existing location search endpoint
   * because the search endpoint provides:
   *   - placeId
   *   - name
   *   - displayName
   *   - latitude
   *   - longitude
   *
   * Timezone lookup is NOT done here.
   */
  useEffect(() => {
    const query = locationText.trim();

    if (
      locationSearchSuppressedRef.current ||
      query.length < 2 ||
      profile.placeOfBirth !== null
    ) {
      return;
    }

    const controller = new AbortController();

    locationAbortRef.current = controller;

    const timeoutId = window.setTimeout(async () => {
      if (locationSearchSuppressedRef.current || controller.signal.aborted) {
        return;
      }

      try {
        const response = await fetch(
          `/api/location/search?q=${encodeURIComponent(query)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted || locationSearchSuppressedRef.current) {
          return;
        }

        if (!response.ok) {
          setSuggestions([]);
          setLocationLoading(false);
          setLocationPopupPosition(null);
          return;
        }

        const payload: unknown = await response.json();

        if (controller.signal.aborted || locationSearchSuppressedRef.current) {
          return;
        }

        const normalized = extractLocationSuggestions(payload);

        setSuggestions(normalized);
        setLocationLoading(false);

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

        setSuggestions([]);
        setLocationLoading(false);
        setLocationPopupPosition(null);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);

      controller.abort();

      if (locationAbortRef.current === controller) {
        locationAbortRef.current = null;
      }
    };
  }, [locationText, profile.placeOfBirth, updateLocationPopupPosition]);

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

    if (value.trim().length >= 2) {
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
   * IMPORTANT:
   * There is NO /api/location/timezone request here.
   *
   * tz-lookup calculates the timezone locally
   * from latitude + longitude.
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
      /*
       * Resolve timezone locally.
       *
       * Example:
       * Delhi coordinates -> Asia/Kolkata
       * London coordinates -> Europe/London
       * New York coordinates -> America/New_York
       */
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
