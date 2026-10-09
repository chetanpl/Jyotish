/*
 * lib/vedic-chart.ts
 *
 * Sidereal (Lahiri) chart, whole-sign houses, Vimshottari dasha.
 * Requires: npm i luxon swisseph-wasm   (and npm i -D @types/luxon)
 *
 * Added in this version:
 *  - PlanetData.ownsHouses        (houses each planet is lord of)
 *  - HouseData.lordPlacedInHouse  (house where the house lord sits)
 *  - dignity now includes "friend" / "enemy" (natural friendship table)
 *  - transits (current gochar) + Sade Sati / Ashtama Shani flags
 */

import SwissEph from "swisseph-wasm";
import { DateTime } from "luxon";

/* ------------------------------------------------------------------ */
/* TYPES                                                               */
/* ------------------------------------------------------------------ */

export type BirthLocation = {
  placeId?: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: number | string; // fallback only
  timezoneId?: string | null; // e.g. "Asia/Kolkata" (preferred)
};

export type BirthProfile = {
  name: string;
  gender?: string;
  dateOfBirth: string; // YYYY-MM-DD
  timeOfBirth: string; // HH:mm or HH:mm:ss (local time at birth place)
  placeOfBirth: BirthLocation | null;
};

export type ZodiacPosition = {
  sign: string;
  signIndex: number;
  degree: number;
  longitude: number;
  formatted: string;
};

export type Nakshatra = {
  index: number;
  name: string;
  lord: string;
  pada: number;
  degreesIntoNakshatra: number;
  formatted: string;
};

export type Dignity =
  | "exalted"
  | "debilitated"
  | "own"
  | "friend"
  | "neutral"
  | "enemy";

export type PlanetData = {
  name: string;
  symbol: string;
  longitude: number;
  speed?: number;
  zodiac: ZodiacPosition;
  nakshatra: Nakshatra;
  house: number;
  retrograde: boolean;
  signLord: string;
  /** Sign-level dignity. Rahu/Ketu are always "neutral" (no friendship table). */
  dignity: Dignity;
  combust: boolean;
  navamsaSign: string;
  aspectsHouses: number[];
  /** Houses (from lagna) of which this planet is the lord. Empty for Rahu/Ketu. */
  ownsHouses: number[];
};

export type HouseData = {
  house: number;
  sign: string;
  lord: string;
  /** House number where this house's lord is placed. */
  lordPlacedInHouse: number;
  planetsInHouse: string[];
};

export type DashaPeriod = { lord: string; start: string; end: string };

export type DashaData = {
  moonNakshatra: Nakshatra;
  calculatedOn: string;
  mahadasha: (DashaPeriod & { remainingYears: number }) | null;
  antardasha: DashaPeriod | null;
  pratyantardasha: DashaPeriod | null;
  currentMahadashaAntardashas: DashaPeriod[];
  upcomingMahadashas: DashaPeriod[];
};

export type TransitPlanet = {
  name: string;
  sign: string;
  degree: number;
  retrograde: boolean;
  houseFromLagna: number;
  houseFromMoon: number;
};

export type TransitData = {
  calculatedOn: string;
  planets: TransitPlanet[];
  sadeSati: {
    active: boolean;
    /** first = Saturn 12th from natal Moon, second = over Moon, third = 2nd from Moon */
    phase: "first" | "second" | "third" | null;
    saturnHouseFromMoon: number;
  };
  /** Saturn transiting the 8th from natal Moon. */
  ashtamaShani: boolean;
};

export type SwissChart = {
  calculation: {
    julianDay: number;
    utcBirthTime: string;
    localBirthTime: string;
    timezoneOffsetHours: number;
    timezoneId: string | null;
    latitude: number;
    longitude: number;
    houseSystem: string;
    zodiac: string;
    ayanamsa: string;
    ayanamsaValue: number;
    nodeType: "mean" | "true";
    dashaYearLength: string;
  };
  ascendant: { longitude: number; zodiac: ZodiacPosition; nakshatra: Nakshatra };
  midheaven: { longitude: number; zodiac: ZodiacPosition };
  planets: Record<string, PlanetData>;
  houses: HouseData[];
  dasha: DashaData;
  /** null only if the transit calculation failed (chart is still valid). */
  transits: TransitData | null;
};

/* ------------------------------------------------------------------ */
/* CONSTANTS                                                           */
/* ------------------------------------------------------------------ */

// "mean" matches Jagannatha Hora / Drik Panchang defaults. Change to "true" if you prefer.
const NODE_TYPE: "mean" | "true" = "mean";

const YEAR_MS = 365.25 * 86_400_000; // Vimshottari year = 365.25 days
const NAKSHATRA_SIZE = 360 / 27;

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

const NAKSHATRAS = [
  { name: "Ashwini", lord: "Ketu" }, { name: "Bharani", lord: "Venus" },
  { name: "Krittika", lord: "Sun" }, { name: "Rohini", lord: "Moon" },
  { name: "Mrigashira", lord: "Mars" }, { name: "Ardra", lord: "Rahu" },
  { name: "Punarvasu", lord: "Jupiter" }, { name: "Pushya", lord: "Saturn" },
  { name: "Ashlesha", lord: "Mercury" }, { name: "Magha", lord: "Ketu" },
  { name: "Purva Phalguni", lord: "Venus" }, { name: "Uttara Phalguni", lord: "Sun" },
  { name: "Hasta", lord: "Moon" }, { name: "Chitra", lord: "Mars" },
  { name: "Swati", lord: "Rahu" }, { name: "Vishakha", lord: "Jupiter" },
  { name: "Anuradha", lord: "Saturn" }, { name: "Jyeshtha", lord: "Mercury" },
  { name: "Mula", lord: "Ketu" }, { name: "Purva Ashadha", lord: "Venus" },
  { name: "Uttara Ashadha", lord: "Sun" }, { name: "Shravana", lord: "Moon" },
  { name: "Dhanishta", lord: "Mars" }, { name: "Shatabhisha", lord: "Rahu" },
  { name: "Purva Bhadrapada", lord: "Jupiter" }, { name: "Uttara Bhadrapada", lord: "Saturn" },
  { name: "Revati", lord: "Mercury" },
] as const;

const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};

const DASHA_SEQUENCE = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
];

// Only the grahas used in Vedic astrology.
const PLANET_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"] as const;

const SYMBOLS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mars: "♂", Mercury: "☿", Jupiter: "♃",
  Venus: "♀", Saturn: "♄", Rahu: "☊", Ketu: "☋",
};

const EXALTATION_SIGN: Record<string, number> = {
  Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6,
};
const DEBILITATION_SIGN: Record<string, number> = {
  Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0,
};
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5],
  Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};

/*
 * Natural (naisargika) friendship, Parashari.
 * Anything not listed as friend or enemy is neutral.
 * NOTE: other software may also add temporary (tatkalika) friendship,
 * so labels can differ from them (e.g. Moon in Aries is "neutral" here).
 */
const NATURAL_FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
};
const NATURAL_ENEMIES: Record<string, string[]> = {
  Sun: ["Venus", "Saturn"],
  Moon: [],
  Mars: ["Mercury"],
  Mercury: ["Moon"],
  Jupiter: ["Mercury", "Venus"],
  Venus: ["Sun", "Moon"],
  Saturn: ["Sun", "Moon", "Mars"],
};

// Combustion orbs in degrees (retrograde orb for Mercury/Venus is smaller).
const COMBUST_ORB: Record<string, { direct: number; retro: number }> = {
  Moon: { direct: 12, retro: 12 },
  Mars: { direct: 17, retro: 17 },
  Mercury: { direct: 14, retro: 12 },
  Jupiter: { direct: 11, retro: 11 },
  Venus: { direct: 10, retro: 8 },
  Saturn: { direct: 15, retro: 15 },
};

// Graha drishti (house offsets counted from the planet, 7th is universal).
// Rahu/Ketu use 5/7/9 (same as Jupiter), which is what AstroSaga also shows.
const ASPECT_OFFSETS: Record<string, number[]> = {
  Sun: [7], Moon: [7], Mercury: [7], Venus: [7],
  Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10],
  Rahu: [5, 7, 9], Ketu: [5, 7, 9],
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                             */
/* ------------------------------------------------------------------ */

function round(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function normalize(longitude: number): number {
  const r = longitude % 360;
  return r < 0 ? r + 360 : r;
}

function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalize(a) - normalize(b));
  return d > 180 ? 360 - d : d;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * YEAR_MS);
}

function num(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`INVALID_NUMBER:${label}`);
  return n;
}

function getZodiacPosition(longitude: number): ZodiacPosition {
  const lon = normalize(longitude);
  const signIndex = Math.min(11, Math.floor(lon / 30));
  const degree = lon - signIndex * 30;
  return {
    sign: ZODIAC_SIGNS[signIndex],
    signIndex,
    degree: round(degree, 4),
    longitude: round(lon, 4),
    formatted: `${ZODIAC_SIGNS[signIndex]} ${degree.toFixed(2)}°`,
  };
}

function getNakshatra(longitude: number): Nakshatra {
  const lon = normalize(longitude);
  const index = Math.min(26, Math.floor(lon / NAKSHATRA_SIZE));
  const into = lon - index * NAKSHATRA_SIZE;
  const pada = Math.min(4, Math.floor(into / (NAKSHATRA_SIZE / 4)) + 1);
  const data = NAKSHATRAS[index];
  return {
    index,
    name: data.name,
    lord: data.lord,
    pada,
    degreesIntoNakshatra: round(into, 4),
    formatted: `${data.name} Pada ${pada} (${data.lord})`,
  };
}

function navamsaSignName(longitude: number): string {
  const idx = Math.floor((normalize(longitude) * 9) / 30) % 12;
  return ZODIAC_SIGNS[idx];
}

function wholeSignHouse(planetLon: number, ascLon: number): number {
  const p = Math.floor(normalize(planetLon) / 30);
  const a = Math.floor(normalize(ascLon) / 30);
  return ((p - a + 12) % 12) + 1;
}

/** Sign-level dignity: exalted > debilitated > own > friend/enemy of sign lord > neutral. */
function getDignity(name: string, signIndex: number): Dignity {
  if (EXALTATION_SIGN[name] === signIndex) return "exalted";
  if (DEBILITATION_SIGN[name] === signIndex) return "debilitated";
  if (OWN_SIGNS[name]?.includes(signIndex)) return "own";

  const signLord = SIGN_LORDS[signIndex];
  if (NATURAL_FRIENDS[name]?.includes(signLord)) return "friend";
  if (NATURAL_ENEMIES[name]?.includes(signLord)) return "enemy";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/* TIME / TIMEZONE (historical, DST-aware)                             */
/* ------------------------------------------------------------------ */

function resolveBirthTime(profile: BirthProfile): {
  utc: Date;
  offsetHours: number;
  zoneId: string | null;
  local: string;
} {
  const loc = profile.placeOfBirth!;
  const time =
    profile.timeOfBirth.split(":").length === 2
      ? `${profile.timeOfBirth}:00`
      : profile.timeOfBirth;

  const zoneId = loc.timezoneId || null;

  // Preferred: IANA zone, so historical DST / offset changes are handled.
  if (zoneId) {
    const dt = DateTime.fromISO(`${profile.dateOfBirth}T${time}`, { zone: zoneId });
    if (dt.isValid) {
      return {
        utc: dt.toUTC().toJSDate(),
        offsetHours: dt.offset / 60,
        zoneId,
        local: dt.toISO() ?? "",
      };
    }
  }

  // Fallback: fixed numeric offset.
  const offset = Number(loc.timezone);
  if (!Number.isFinite(offset)) throw new Error("INVALID_TIMEZONE");

  const [y, mo, d] = profile.dateOfBirth.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - offset * 3_600_000;

  return {
    utc: new Date(ms),
    offsetHours: offset,
    zoneId,
    local: `${profile.dateOfBirth}T${time} (UTC${offset >= 0 ? "+" : ""}${offset})`,
  };
}

/* ------------------------------------------------------------------ */
/* SWISS EPHEMERIS HELPERS                                             */
/* ------------------------------------------------------------------ */

function planetId(swe: SwissEph, name: string): number {
  const map: Record<string, number> = {
    Sun: swe.SE_SUN, Moon: swe.SE_MOON, Mars: swe.SE_MARS,
    Mercury: swe.SE_MERCURY, Jupiter: swe.SE_JUPITER,
    Venus: swe.SE_VENUS, Saturn: swe.SE_SATURN,
  };
  const id = map[name];
  if (typeof id !== "number") throw new Error(`UNKNOWN_PLANET:${name}`);
  return id;
}

function getAyanamsaUt(swe: SwissEph, jd: number): number {
  const anySwe = swe as unknown as Record<string, unknown>;
  const fn = (anySwe.get_ayanamsa_ut ?? anySwe.get_ayanamsa) as
    | ((jd: number) => number)
    | undefined;
  if (typeof fn !== "function") throw new Error("AYANAMSA_FUNCTION_MISSING");
  return num(fn.call(swe, jd), "ayanamsa");
}

/** Handles the different result shapes swisseph builds return. Throws instead of defaulting to 0. */
function extractAscMc(result: unknown): { asc: number; mc: number } {
  const r = result as Record<string, unknown> | null;
  if (!r) throw new Error("INVALID_SWISS_HOUSE_RESULT");

  const ascmc = r.ascmc as ArrayLike<number> | undefined;
  if (ascmc && ascmc.length >= 2) {
    return { asc: num(ascmc[0], "asc"), mc: num(ascmc[1], "mc") };
  }

  const asc = r.ascendant ?? r.asc;
  const mc = r.mc ?? r.midheaven;
  if (asc !== undefined && mc !== undefined) {
    return { asc: num(asc, "asc"), mc: num(mc, "mc") };
  }

  throw new Error(`UNSUPPORTED_HOUSE_RESULT_SHAPE:${Object.keys(r).join(",")}`);
}

/* ------------------------------------------------------------------ */
/* VIMSHOTTARI DASHA                                                   */
/* ------------------------------------------------------------------ */

type Period = { lord: string; start: Date; end: Date };

function subPeriods(parent: Period): Period[] {
  const parentMs = parent.end.getTime() - parent.start.getTime();
  const startIdx = DASHA_SEQUENCE.indexOf(parent.lord);
  const result: Period[] = [];
  let cursor = parent.start.getTime();

  for (let i = 0; i < 9; i += 1) {
    const lord = DASHA_SEQUENCE[(startIdx + i) % 9];
    const isLast = i === 8;
    const end = isLast
      ? parent.end.getTime()
      : cursor + (parentMs * DASHA_YEARS[lord]) / 120;
    result.push({ lord, start: new Date(cursor), end: new Date(end) });
    cursor = end;
  }
  return result;
}

function toPeriodDto(p: Period): DashaPeriod {
  return { lord: p.lord, start: formatDate(p.start), end: formatDate(p.end) };
}

function calculateVimshottari(
  moonLongitude: number,
  birthUtc: Date,
  now: Date,
): DashaData {
  const moonNak = getNakshatra(moonLongitude);
  const lord = moonNak.lord;
  const fullYears = DASHA_YEARS[lord];

  const fractionElapsed = Math.min(
    1,
    Math.max(0, moonNak.degreesIntoNakshatra / NAKSHATRA_SIZE),
  );
  const elapsedYears = fullYears * fractionElapsed;

  // Virtual start of the birth mahadasha (before birth).
  let cursor = addYears(birthUtc, -elapsedYears);
  const startIdx = DASHA_SEQUENCE.indexOf(lord);

  // Two full 120-year cycles is more than enough for any lifetime.
  const maha: Period[] = [];
  for (let i = 0; i < 18; i += 1) {
    const l = DASHA_SEQUENCE[(startIdx + i) % 9];
    const end = addYears(cursor, DASHA_YEARS[l]);
    maha.push({ lord: l, start: new Date(cursor), end });
    cursor = end;
  }

  const currentIdx = maha.findIndex((p) => now >= p.start && now < p.end);
  const current = currentIdx >= 0 ? maha[currentIdx] : null;

  let antar: Period | null = null;
  let praty: Period | null = null;
  let antarList: Period[] = [];

  if (current) {
    antarList = subPeriods(current);
    antar = antarList.find((p) => now >= p.start && now < p.end) ?? null;
    if (antar) {
      praty = subPeriods(antar).find((p) => now >= p.start && now < p.end) ?? null;
    }
  }

  return {
    moonNakshatra: moonNak,
    calculatedOn: formatDate(now),
    mahadasha: current
      ? {
          ...toPeriodDto(current),
          remainingYears: round(
            Math.max(0, (current.end.getTime() - now.getTime()) / YEAR_MS),
            2,
          ),
        }
      : null,
    antardasha: antar ? toPeriodDto(antar) : null,
    pratyantardasha: praty ? toPeriodDto(praty) : null,
    currentMahadashaAntardashas: antarList.map(toPeriodDto),
    upcomingMahadashas:
      currentIdx >= 0 ? maha.slice(currentIdx + 1, currentIdx + 3).map(toPeriodDto) : [],
  };
}

/* ------------------------------------------------------------------ */
/* TRANSITS (GOCHAR)                                                   */
/* ------------------------------------------------------------------ */

function calculateTransits(
  swe: SwissEph,
  now: Date,
  ascLon: number,
  moonLon: number,
  flagsSid: number,
): TransitData {
  const jdNow = swe.julday(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600,
  );

  const current: Record<string, { lon: number; retrograde: boolean }> = {};

  for (const name of PLANET_NAMES) {
    const v = Array.from(swe.calc_ut(jdNow, planetId(swe, name), flagsSid));
    if (v.length < 4) throw new Error(`INVALID_TRANSIT_RESULT:${name}`);
    current[name] = {
      lon: normalize(num(v[0], `transit.${name}`)),
      retrograde: num(v[3], `transit.${name}.speed`) < 0,
    };
  }

  const nodeId = NODE_TYPE === "mean" ? swe.SE_MEAN_NODE : swe.SE_TRUE_NODE;
  const nodeVals = Array.from(swe.calc_ut(jdNow, nodeId, flagsSid));
  const rahuLon = normalize(num(nodeVals[0], "transit.rahu"));
  current.Rahu = { lon: rahuLon, retrograde: true };
  current.Ketu = { lon: normalize(rahuLon + 180), retrograde: true };

  const planets: TransitPlanet[] = Object.entries(current).map(
    ([name, { lon, retrograde }]) => {
      const z = getZodiacPosition(lon);
      return {
        name,
        sign: z.sign,
        degree: round(z.degree, 2),
        retrograde,
        houseFromLagna: wholeSignHouse(lon, ascLon),
        houseFromMoon: wholeSignHouse(lon, moonLon),
      };
    },
  );

  const saturnFromMoon = planets.find((p) => p.name === "Saturn")!.houseFromMoon;
  const phase =
    saturnFromMoon === 12
      ? "first"
      : saturnFromMoon === 1
        ? "second"
        : saturnFromMoon === 2
          ? "third"
          : null;

  return {
    calculatedOn: formatDate(now),
    planets,
    sadeSati: {
      active: phase !== null,
      phase,
      saturnHouseFromMoon: saturnFromMoon,
    },
    ashtamaShani: saturnFromMoon === 8,
  };
}

/* ------------------------------------------------------------------ */
/* MAIN CHART CALCULATION                                              */
/* ------------------------------------------------------------------ */

export async function calculateSwissChart(profile: BirthProfile): Promise<SwissChart> {
  if (!profile.placeOfBirth) throw new Error("BIRTH_LOCATION_REQUIRED");
  const loc = profile.placeOfBirth;

  const birth = resolveBirthTime(profile);
  const u = birth.utc;
  const hour =
    u.getUTCHours() + u.getUTCMinutes() / 60 + u.getUTCSeconds() / 3600;

  const swe = new SwissEph();

  try {
    await swe.initSwissEph();
    swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

    const jd = swe.julday(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), hour);
    const ayanamsa = getAyanamsaUt(swe, jd);

    const flagsSid = swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL | swe.SEFLG_SPEED;
    const flagsTrop = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;

    /* Sanity check: sidereal = tropical - ayanamsa. Catches a wrong ayanamsa setup. */
    const tropSun = num(Array.from(swe.calc_ut(jd, swe.SE_SUN, flagsTrop))[0], "tropSun");
    const sidSun = num(Array.from(swe.calc_ut(jd, swe.SE_SUN, flagsSid))[0], "sidSun");
    const diff = normalize(tropSun - sidSun);
    if (Math.abs(diff - ayanamsa) > 0.01) {
      throw new Error(`AYANAMSA_MISMATCH:${diff.toFixed(4)} vs ${ayanamsa.toFixed(4)}`);
    }

    /* Ascendant + MC: swe.houses is TROPICAL, so convert to sidereal. */
    const { asc: tropAsc, mc: tropMc } = extractAscMc(
      swe.houses(jd, loc.latitude, loc.longitude, "P"),
    );
    const ascLon = normalize(tropAsc - ayanamsa);
    const mcLon = normalize(tropMc - ayanamsa);

    /* Raw planet data */
    const raw: Record<string, { lon: number; speed: number }> = {};

    for (const name of PLANET_NAMES) {
      const v = Array.from(swe.calc_ut(jd, planetId(swe, name), flagsSid));
      if (v.length < 4) throw new Error(`INVALID_SWISS_RESULT:${name}`);
      raw[name] = { lon: normalize(num(v[0], name)), speed: num(v[3], `${name}.speed`) };
    }

    const nodeId = NODE_TYPE === "mean" ? swe.SE_MEAN_NODE : swe.SE_TRUE_NODE;
    const nodeVals = Array.from(swe.calc_ut(jd, nodeId, flagsSid));
    const rahuLon = normalize(num(nodeVals[0], "rahu"));
    raw.Rahu = { lon: rahuLon, speed: -1 };
    raw.Ketu = { lon: normalize(rahuLon + 180), speed: -1 };

    /* House lordship: which houses (from lagna) each planet rules. */
    const ascSign = Math.floor(ascLon / 30);
    const ownsHousesByPlanet: Record<string, number[]> = {};
    for (let i = 0; i < 12; i += 1) {
      const lord = SIGN_LORDS[(ascSign + i) % 12];
      if (!ownsHousesByPlanet[lord]) ownsHousesByPlanet[lord] = [];
      ownsHousesByPlanet[lord].push(i + 1);
    }

    /* Build planet objects */
    const sunLon = raw.Sun.lon;
    const planets: Record<string, PlanetData> = {};

    for (const [name, { lon, speed }] of Object.entries(raw)) {
      const zodiac = getZodiacPosition(lon);
      const house = wholeSignHouse(lon, ascLon);
      const retrograde = speed < 0;

      const dignity = getDignity(name, zodiac.signIndex);

      const orb = COMBUST_ORB[name];
      const combust = orb
        ? angularDistance(lon, sunLon) <= (retrograde ? orb.retro : orb.direct)
        : false;

      const aspectsHouses = (ASPECT_OFFSETS[name] ?? []).map(
        (offset) => ((house - 1 + offset - 1) % 12) + 1,
      );

      planets[name] = {
        name,
        symbol: SYMBOLS[name] ?? "",
        longitude: round(lon, 6),
        speed: name === "Rahu" || name === "Ketu" ? undefined : round(speed, 6),
        zodiac,
        nakshatra: getNakshatra(lon),
        house,
        retrograde,
        signLord: SIGN_LORDS[zodiac.signIndex],
        dignity,
        combust,
        navamsaSign: navamsaSignName(lon),
        aspectsHouses,
        ownsHouses: ownsHousesByPlanet[name] ?? [],
      };
    }

    /* Whole-sign houses */
    const houses: HouseData[] = Array.from({ length: 12 }, (_, i) => {
      const signIdx = (ascSign + i) % 12;
      const lord = SIGN_LORDS[signIdx];
      return {
        house: i + 1,
        sign: ZODIAC_SIGNS[signIdx],
        lord,
        lordPlacedInHouse: planets[lord].house,
        planetsInHouse: Object.values(planets)
          .filter((p) => p.house === i + 1)
          .map((p) => p.name),
      };
    });

    const now = new Date();
    const dasha = calculateVimshottari(raw.Moon.lon, u, now);

    /* Transits are an extra; never fail the whole chart because of them. */
    let transits: TransitData | null = null;
    try {
      transits = calculateTransits(swe, now, ascLon, raw.Moon.lon, flagsSid);
    } catch (error) {
      console.warn(
        "[Swiss Ephemeris] Transit calculation failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    return {
      calculation: {
        julianDay: round(jd, 6),
        utcBirthTime: u.toISOString(),
        localBirthTime: birth.local,
        timezoneOffsetHours: birth.offsetHours,
        timezoneId: birth.zoneId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        houseSystem: "Whole Sign",
        zodiac: "Sidereal",
        ayanamsa: "Lahiri (Chitrapaksha)",
        ayanamsaValue: round(ayanamsa, 6),
        nodeType: NODE_TYPE,
        dashaYearLength: "365.25 days",
      },
      ascendant: {
        longitude: round(ascLon, 4),
        zodiac: getZodiacPosition(ascLon),
        nakshatra: getNakshatra(ascLon),
      },
      midheaven: { longitude: round(mcLon, 4), zodiac: getZodiacPosition(mcLon) },
      planets,
      houses,
      dasha,
      transits,
    };
  } finally {
    try {
      swe.close();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* SERIALIZATION FOR THE AI                                            */
/* ------------------------------------------------------------------ */

export function serializeChartForAI(chart: SwissChart): string {
  return JSON.stringify(
    {
      calculation: chart.calculation,
      ascendant: {
        sign: chart.ascendant.zodiac.sign,
        degree: round(chart.ascendant.zodiac.degree, 2),
        nakshatra: chart.ascendant.nakshatra.formatted,
      },
      houses: chart.houses,
      planets: Object.values(chart.planets).map((p) => ({
        name: p.name,
        sign: p.zodiac.sign,
        degree: round(p.zodiac.degree, 2),
        house: p.house,
        ownsHouses: p.ownsHouses,
        signLord: p.signLord,
        dignity: p.dignity,
        combust: p.combust,
        retrograde: p.retrograde,
        nakshatra: p.nakshatra.formatted,
        navamsaSign: p.navamsaSign,
        aspectsHouses: p.aspectsHouses,
      })),
      dasha: {
        moonNakshatra: chart.dasha.moonNakshatra.formatted,
        calculatedOn: chart.dasha.calculatedOn,
        mahadasha: chart.dasha.mahadasha,
        antardasha: chart.dasha.antardasha,
        pratyantardasha: chart.dasha.pratyantardasha,
        currentMahadashaAntardashas: chart.dasha.currentMahadashaAntardashas,
        upcomingMahadashas: chart.dasha.upcomingMahadashas,
      },
      transits: chart.transits,
    },
    null,
    2,
  );
}