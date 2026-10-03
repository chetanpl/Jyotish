import tzlookup from "tz-lookup";
import type { LocationSuggestion } from "@/lib/astro-ui";

/**
 * Normalises the different payload shapes the location search API may return.
 */
export function extractLocationSuggestions(
  payload: unknown,
): LocationSuggestion[] {
  let items: unknown[] = [];

  if (Array.isArray(payload)) {
    items = payload;
  } else if (typeof payload === "object" && payload !== null) {
    const object = payload as Record<string, unknown>;

    if (Array.isArray(object.suggestions)) {
      items = object.suggestions;
    } else if (Array.isArray(object.results)) {
      items = object.results;
    } else if (typeof object.data === "object" && object.data !== null) {
      const data = object.data as Record<string, unknown>;

      if (Array.isArray(data.suggestions)) {
        items = data.suggestions;
      } else if (Array.isArray(data.results)) {
        items = data.results;
      }
    }
  }

  return items.flatMap((item): LocationSuggestion[] => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const source = item as Record<string, unknown>;

    const placeIdValue = source.placeId ?? source.place_id ?? source.id;

    const nameValue =
      source.name ?? source.displayName ?? source.display_name ?? source.label;

    const displayNameValue =
      source.displayName ?? source.display_name ?? source.label ?? source.name;

    const latitudeValue = source.latitude ?? source.lat;

    const longitudeValue = source.longitude ?? source.lon ?? source.lng;

    const placeId =
      typeof placeIdValue === "string"
        ? placeIdValue
        : typeof placeIdValue === "number"
          ? String(placeIdValue)
          : "";

    const name = typeof nameValue === "string" ? nameValue : "";

    const displayName =
      typeof displayNameValue === "string" ? displayNameValue : "";

    const latitude =
      typeof latitudeValue === "number" ? latitudeValue : Number(latitudeValue);

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

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
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
  });
}

/**
 * Resolves an IANA timezone directly from latitude/longitude.
 *
 * Examples:
 *   28.6139, 77.2090 -> Asia/Kolkata
 *   51.5074, -0.1278  -> Europe/London
 *   40.7128, -74.0060 -> America/New_York
 */
export function getTimezoneFromCoordinates(
  latitude: number,
  longitude: number,
): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Invalid latitude or longitude.");
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("Latitude or longitude is outside the valid range.");
  }

  return tzlookup(latitude, longitude);
}
