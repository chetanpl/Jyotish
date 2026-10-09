import { NextRequest, NextResponse } from "next/server";

import { calculateSwissChart, type BirthProfile } from "../../../lib/vedic-chart";

export const runtime = "nodejs";

/*
 * DEV-ONLY test endpoint. Delete this folder after testing.
 *
 * Nothing is hard-coded: every birth detail must come from the URL.
 *
 * Required: dob, tob, lat, lon, tz
 * Optional: place (label only), offset (hours, used only if tz is invalid)
 *
 * Example:
 * /api/test-chart?dob=1985-06-14&tob=04:45&lat=28.7306&lon=77.7759&tz=Asia/Kolkata
 */

const USAGE =
  "/api/test-chart?dob=YYYY-MM-DD&tob=HH:mm&lat=<number>&lon=<number>&tz=<IANA zone, e.g. Asia/Kolkata>";

class ParamError extends Error {}

function required(q: URLSearchParams, key: string): string {
  const value = q.get(key)?.trim();

  if (!value) {
    throw new ParamError(`MISSING_PARAM:${key}`);
  }

  return value;
}

function requiredNumber(
  q: URLSearchParams,
  key: string,
  min: number,
  max: number,
): number {
  const raw = required(q, key);
  const n = Number(raw);

  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ParamError(`INVALID_PARAM:${key} (expected ${min} to ${max}, got "${raw}")`);
  }

  return n;
}

/** Degrees inside a sign -> "DD-MM-SS", same style as AstroSaga's Longitude column. */
function toDms(degreeInSign: number): string {
  const total = Math.round(degreeInSign * 3600);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return [d, m, s].map((v) => String(v).padStart(2, "0")).join("-");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const q = request.nextUrl.searchParams;

  let profile: BirthProfile;

  try {
    const dob = required(q, "dob");
    const tob = required(q, "tob");
    const tz = required(q, "tz");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw new ParamError(`INVALID_PARAM:dob (expected YYYY-MM-DD, got "${dob}")`);
    }

    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(tob)) {
      throw new ParamError(`INVALID_PARAM:tob (expected HH:mm, got "${tob}")`);
    }

    const latitude = requiredNumber(q, "lat", -90, 90);
    const longitude = requiredNumber(q, "lon", -180, 180);

    /*
     * offset is only a fallback if tz is not a valid IANA zone.
     * If it is not supplied we pass NaN so the chart fails loudly
     * (INVALID_TIMEZONE) instead of silently using UTC.
     */
    const offsetRaw = q.get("offset")?.trim();
    const offset = offsetRaw ? Number(offsetRaw) : Number.NaN;

    const place = q.get("place")?.trim() || "Test place";

    profile = {
      name: "Test",
      dateOfBirth: dob,
      timeOfBirth: tob,
      placeOfBirth: {
        name: place,
        displayName: place,
        latitude,
        longitude,
        timezone: offset,
        timezoneId: tz,
      },
    };
  } catch (error) {
    if (error instanceof ParamError) {
      return NextResponse.json(
        { error: error.message, usage: USAGE },
        { status: 400 },
      );
    }

    throw error;
  }

  try {
    const chart = await calculateSwissChart(profile);

    return NextResponse.json(
      {
        input: {
          localTime: chart.calculation.localBirthTime,
          utcTime: chart.calculation.utcBirthTime,
          timezone: chart.calculation.timezoneId,
          offsetHours: chart.calculation.timezoneOffsetHours,
          latitude: chart.calculation.latitude,
          longitude: chart.calculation.longitude,
          ayanamsa: chart.calculation.ayanamsaValue,
          nodeType: chart.calculation.nodeType,
        },
        lagna: {
          position: chart.ascendant.zodiac.formatted,
          dms: `${chart.ascendant.zodiac.sign} ${toDms(chart.ascendant.zodiac.degree)}`,
          nakshatra: chart.ascendant.nakshatra.formatted,
        },
        moon: {
          sign: chart.planets.Moon.zodiac.formatted,
          nakshatra: chart.planets.Moon.nakshatra.formatted,
        },
        planets: Object.values(chart.planets).map((p) => ({
          name: p.name,
          position: p.zodiac.formatted,
          dms: `${p.zodiac.sign} ${toDms(p.zodiac.degree)}`,
          house: p.house,
          ownsHouses: p.ownsHouses,
          nakshatra: p.nakshatra.formatted,
          retrograde: p.retrograde,
          dignity: p.dignity,
          combust: p.combust,
          aspectsHouses: p.aspectsHouses,
        })),
        houses: chart.houses.map((h) => ({
          house: h.house,
          sign: h.sign,
          lord: h.lord,
          lordPlacedInHouse: h.lordPlacedInHouse,
          planets: h.planetsInHouse,
        })),
        dasha: {
          mahadasha: chart.dasha.mahadasha,
          antardasha: chart.dasha.antardasha,
          pratyantardasha: chart.dasha.pratyantardasha,
        },
        transits: chart.transits,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}