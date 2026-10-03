import { NextRequest, NextResponse } from "next/server";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  [key: string]: string | undefined;
};

type NominatimPlace = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

type LocationResult = {
  placeId?: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  address: NominatimAddress;
};

function isNominatimPlace(value: unknown): value is NominatimPlace {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return true;
}

function parseNominatimResponse(value: unknown): NominatimPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isNominatimPlace);
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");

    url.searchParams.set("format", "jsonv2");

    url.searchParams.set("q", query);

    url.searchParams.set("limit", "6");

    url.searchParams.set("addressdetails", "1");

    url.searchParams.set("accept-language", "en");

    const response = await fetch(url.toString(), {
      method: "GET",

      headers: {
        Accept: "application/json",

        "User-Agent": "AstrologyAI/1.0",
      },

      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Location search failed",
        },
        {
          status: 502,
        },
      );
    }

    const json: unknown = await response.json();

    const places = parseNominatimResponse(json);

    const results: LocationResult[] = places
      .map((place) => {
        const displayName = place.display_name?.trim() ?? "";

        const firstName = displayName.split(",")[0]?.trim() ?? "";

        const name =
          place.address?.city?.trim() ||
          place.address?.town?.trim() ||
          place.address?.village?.trim() ||
          place.address?.municipality?.trim() ||
          firstName ||
          query;

        const latitude = Number(place.lat);

        const longitude = Number(place.lon);

        return {
          placeId:
            place.place_id !== undefined ? String(place.place_id) : undefined,

          name,

          displayName: displayName || query,

          latitude,

          longitude,

          address: place.address ?? {},
        };
      })
      .filter(
        (place) =>
          Number.isFinite(place.latitude) && Number.isFinite(place.longitude),
      );

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      {
        error: "Unable to search location",
      },
      {
        status: 500,
      },
    );
  }
}
