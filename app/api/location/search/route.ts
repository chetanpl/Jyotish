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
// Nominatim/Photon policy: User-Agent mein app ka naam + real contact dena chahiye
const USER_AGENT = "AstrologyAI/1.0 (contact: your-real-email@yourdomain.com)";
const TIMEOUT_MS = 6000;

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

// ---------- LocationIQ (only if key is set and quota remains) ----------
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 86400 },
  });

  if (res.status === 404) return []; // LocationIQ "no results" ko 404 deta hai
  if (!res.ok) throw new Error(`LOCATIONIQ_${res.status}`);
  return parse(await res.json());
}

// ---------- Open-Meteo (free, no key, returns timezone too) ----------
async function searchOpenMeteo(
  query: string,
  country: string | null
): Promise<RawPlace[]> {
  const parts = query.split(",").map((s) => s.trim()).filter(Boolean);
  const name = parts[0] ?? query;
  const hint = parts.slice(1).join(" ").toLowerCase();

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  if (country) url.searchParams.set("countryCode", country.toUpperCase());

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`OPENMETEO_${res.status}`);

  const data = (await res.json()) as {
    results?: Array<{
      id: number;
      name: string;
      latitude: number;
      longitude: number;
      timezone?: string;
      country?: string;
      country_code?: string;
      admin1?: string;
      admin2?: string;
    }>;
  };

  let results = data.results ?? [];
  if (hint) {
    const filtered = results.filter((r) =>
      [r.admin1, r.admin2, r.country].some(
        (x) => x && hint.includes(x.toLowerCase())
      )
    );
    if (filtered.length) results = filtered;
  }

  return results.slice(0, 8).map((r) => ({
    place_id: `om-${r.id}`,
    display_name: [r.name, r.admin2, r.admin1, r.country]
      .filter(Boolean)
      .join(", "),
    lat: String(r.latitude),
    lon: String(r.longitude),
    address: {
      city: r.name,
      state_district: r.admin2,
      state: r.admin1,
      country: r.country,
      country_code: r.country_code?.toLowerCase(),
      timezone: r.timezone,
    },
  }));
}

// ---------- Photon (free, no key, autocomplete friendly) ----------
async function searchPhoton(
  query: string,
  country: string | null
): Promise<RawPlace[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`PHOTON_${res.status}`);

  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, string | number | undefined>;
    }>;
  };

  const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

  return (data.features ?? [])
    .filter((f) => f.geometry?.coordinates)
    .filter(
      (f) =>
        !country ||
        String(f.properties?.countrycode ?? "").toLowerCase() === country
    )
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry!.coordinates!;
      const local = s(p.city) ?? s(p.name);
      return {
        place_id: s(p.osm_id),
        display_name: [local, s(p.county), s(p.state), s(p.country)]
          .filter(Boolean)
          .join(", "),
        lat: String(lat),
        lon: String(lon),
        address: {
          city: local,
          state_district: s(p.county) ?? s(p.district),
          state: s(p.state),
          country: s(p.country),
        },
      };
    });
}

// ---------- Nominatim (last resort) ----------
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`NOMINATIM_${res.status}`);
  return parse(await res.json());
}

// ---------- Provider chain ----------
async function searchAll(
  query: string,
  country: string | null
): Promise<RawPlace[]> {
  const providers: Array<[string, () => Promise<RawPlace[]>]> = [];
  if (LOCATIONIQ_KEY) {
    providers.push(["locationiq", () => searchLocationIQ(query, country)]);
  }
  providers.push(["open-meteo", () => searchOpenMeteo(query, country)]);
  providers.push(["photon", () => searchPhoton(query, country)]);
  providers.push(["nominatim", () => searchNominatim(query, country)]);

  let lastErr: unknown;
  let anySucceeded = false;
  const errors: string[] = [];

  for (const [name, run] of providers) {
    try {
      const places = await run();
      anySucceeded = true;
      if (places.length) return places;
    } catch (err) {
      lastErr = err;
      const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
      const msg = `${name}: ${err instanceof Error ? `${err.name} ${err.message}` : String(err)}${cause ? ` (cause: ${String(cause)})` : ""}`;
      errors.push(msg);
      console.error(msg);
    }
  }

  // Sab fail hue to error, warna "no results" = empty list
  if (!anySucceeded && lastErr) throw new Error(errors.join(" | "));
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    // Optional: ?country=in  (sirf India mein dhundna ho to)
    const country =
      req.nextUrl.searchParams.get("country")?.trim().toLowerCase() || null;

    if (query.length < 3) return NextResponse.json([]);

    const places = await searchAll(query, country);
    return NextResponse.json(normalize(places, query));
  } catch (err) {
    console.error("Location search error:", err);
    return NextResponse.json(
      {
        error: "Unable to search location",
        detail: err instanceof Error ? err.message : String(err), // debug: baad mein hata dena
      },
      { status: 500 }
    );
  }
}