import { NextRequest, NextResponse } from "next/server";

type Address = Record<string, string | undefined>;

type RawPlace = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Address;
};

type LocationResult = {
  placeId?: string;
  name: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
  address: Address;
};

const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY;
// Nominatim policy: User-Agent mein app ka naam + contact dena chahiye
const USER_AGENT = "AstrologyAI/1.0 (contact: you@example.com)";

function isPlace(v: unknown): v is RawPlace {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parse(v: unknown): RawPlace[] {
  return Array.isArray(v) ? v.filter(isPlace) : [];
}

function buildLabel(a: Address, fallback: string): string {
  const local =
    a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality;
  const district = a.state_district || a.county;
  const parts = [local, district, a.state, a.country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(", ") : fallback;
}

function normalize(places: RawPlace[], query: string): LocationResult[] {
  return places
    .map((p) => {
      const displayName = p.display_name?.trim() || query;
      const a = p.address ?? {};
      const name =
        a.city?.trim() ||
        a.town?.trim() ||
        a.village?.trim() ||
        a.hamlet?.trim() ||
        a.municipality?.trim() ||
        displayName.split(",")[0]?.trim() ||
        query;
      return {
        placeId: p.place_id !== undefined ? String(p.place_id) : undefined,
        name,
        label: buildLabel(a, displayName),
        displayName,
        latitude: Number(p.lat),
        longitude: Number(p.lon),
        address: a,
      };
    })
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

async function searchLocationIQ(query: string, country: string | null) {
  const url = new URL("https://api.locationiq.com/v1/autocomplete");
  url.searchParams.set("key", LOCATIONIQ_KEY!);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("normalizecity", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("format", "json");
  if (country) url.searchParams.set("countrycodes", country);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 }, // same query dobara aaye to quota nahi katega
  });

  if (res.status === 404) return []; // LocationIQ "no results" ko 404 deta hai
  if (!res.ok) throw new Error(`LOCATIONIQ_${res.status}`);
  return parse(await res.json());
}

async function searchNominatim(query: string, country: string | null) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  if (country) url.searchParams.set("countrycodes", country);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    next: { revalidate: 86400 },
  });

  if (!res.ok) throw new Error(`NOMINATIM_${res.status}`);
  return parse(await res.json());
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    // Optional: ?country=in  (sirf India mein dhundna ho to)
    const country = req.nextUrl.searchParams.get("country")?.trim().toLowerCase() || null;

    if (query.length < 3) return NextResponse.json([]);

    let places: RawPlace[] = [];

    if (LOCATIONIQ_KEY) {
      try {
        places = await searchLocationIQ(query, country);
      } catch (err) {
        console.error("LocationIQ failed, falling back:", err);
        places = await searchNominatim(query, country);
      }
    } else {
      places = await searchNominatim(query, country);
    }

    return NextResponse.json(normalize(places, query));
  } catch (err) {
    console.error("Location search error:", err);
    return NextResponse.json({ error: "Unable to search location" }, { status: 500 });
  }
}