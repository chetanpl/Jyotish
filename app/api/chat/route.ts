import { NextRequest, NextResponse } from "next/server";
import SwissEph from "swisseph-wasm";

import { ASTROLOGY_SYSTEM_RULES } from "../../../lib/astrology-rules";
import { callGroq } from "../../../lib/groq";
import { sendAstroEmail } from "../../../lib/sendAstroEmail";
import {
  getConversationMemory,
  setConversationMemory,
} from "../../../lib/conversation-cache";

export const runtime = "nodejs";

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type ResponseLanguage = "en" | "hi";

type ThinkingLevel = "low" | "medium" | "high";

type BirthLocation = {
  placeId?: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: number | string;
  timezoneId?: string | null;
};

type BirthProfile = {
  name: string;
  gender?: string;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: BirthLocation | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationMemory = {
  summary: string;
  summaryMessageCount: number;
};

type ZodiacPosition = {
  sign: string;
  signIndex: number;
  degree: number;
  longitude: number;
  formatted: string;
};

type Nakshatra = {
  index: number;
  name: string;
  lord: string;
  pada: number;
  degreesIntoNakshatra: number;
  formatted: string;
};

type PlanetData = {
  name: string;
  symbol: string;
  longitude: number;
  latitude?: number;
  distance?: number;
  speed?: number;
  zodiac: ZodiacPosition;
  nakshatra: Nakshatra;
  house: number | null;
  retrograde?: boolean;
};

type HouseData = {
  house: number;
  longitude: number;
  zodiac: ZodiacPosition;
};

type DashaPeriod = {
  lord: string;
  start: string;
  end: string;
};

type DashaEntry = {
  lord: string;
  start: string;
  end: string;
};

type DashaData = {
  moonNakshatra: Nakshatra;

  mahadasha:
    | (DashaPeriod & {
        remainingYears: number;
      })
    | null;

  antardasha: DashaPeriod | null;

  timeline: DashaEntry[];
};

type SwissChart = {
  calculation: {
    julianDay: number;
    utcBirthTime: string;
    timezone: number;
    timezoneId: string | null;
    latitude: number;
    longitude: number;
    houseSystem: string;
    zodiac: string;
    ayanamsa: string;
    ayanamsaValue: number | null;
    swissEphemeris: string;
  };

  ascendant: {
    longitude: number;
    zodiac: ZodiacPosition;
  };

  midheaven: {
    longitude: number;
    zodiac: ZodiacPosition;
  };

  planets: Record<string, PlanetData>;

  houses: HouseData[];

  dasha: DashaData;
};

type GeminiPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  modelUsed?: string;
};

type AstroAnswerPayload = {
  answer: string;
  conversationTopic: string;
};

type GeminiErrorInfo = {
  status: number;
  message: string;
};

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

const GEMINI_FALLBACK_MODELS = [
  process.env.GEMINI_FALLBACK_MODEL_1?.trim() || "gemini-3.7-flash",

  process.env.GEMINI_FALLBACK_MODEL_2?.trim() || "gemini-3.6-flash",
].filter(Boolean);

const GEMINI_MODEL_CHAIN = [
  MODEL,
  ...GEMINI_FALLBACK_MODELS.filter((model) => model !== MODEL),
];

const MAX_OUTPUT_TOKENS = 6144;

const MAX_SUMMARY_CHARS = 5000;

const MAX_CONVERSATION_TOPIC_CHARS = 1800;

const MAX_GEMINI_RETRIES = 1;

const GEMINI_RETRY_DELAY_MS = 1000;

const GEMINI_TIMEOUT_MS = 45_000;

const MAX_MESSAGES = 100;

const MAX_MESSAGE_LENGTH = 6000;

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

const NAKSHATRAS = [
  { name: "Ashwini", lord: "Ketu" },
  { name: "Bharani", lord: "Venus" },
  { name: "Krittika", lord: "Sun" },
  { name: "Rohini", lord: "Moon" },
  { name: "Mrigashira", lord: "Mars" },
  { name: "Ardra", lord: "Rahu" },
  { name: "Punarvasu", lord: "Jupiter" },
  { name: "Pushya", lord: "Saturn" },
  { name: "Ashlesha", lord: "Mercury" },
  { name: "Magha", lord: "Ketu" },
  { name: "Purva Phalguni", lord: "Venus" },
  { name: "Uttara Phalguni", lord: "Sun" },
  { name: "Hasta", lord: "Moon" },
  { name: "Chitra", lord: "Mars" },
  { name: "Swati", lord: "Rahu" },
  { name: "Vishakha", lord: "Jupiter" },
  { name: "Anuradha", lord: "Saturn" },
  { name: "Jyeshtha", lord: "Mercury" },
  { name: "Mula", lord: "Ketu" },
  { name: "Purva Ashadha", lord: "Venus" },
  { name: "Uttara Ashadha", lord: "Sun" },
  { name: "Shravana", lord: "Moon" },
  { name: "Dhanishta", lord: "Mars" },
  { name: "Shatabhisha", lord: "Rahu" },
  { name: "Purva Bhadrapada", lord: "Jupiter" },
  { name: "Uttara Bhadrapada", lord: "Saturn" },
  { name: "Revati", lord: "Mercury" },
] as const;

const DASHA_YEARS: Record<string, number> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

const DASHA_SEQUENCE = [
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury",
];

/*
|--------------------------------------------------------------------------
| GENERAL HELPERS
|--------------------------------------------------------------------------
*/

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function isLanguage(value: unknown): value is ResponseLanguage {
  return value === "en" || value === "hi";
}

function getLanguage(value: unknown): ResponseLanguage {
  return isLanguage(value) ? value : "hi";
}

function getThinkingLevel(): ThinkingLevel {
  const value = process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (
      error as {
        status?: unknown;
      }
    ).status;

    if (typeof status === "number") {
      return status;
    }
  }

  return 0;
}

/*
|--------------------------------------------------------------------------
| DATE / NUMBER HELPERS
|--------------------------------------------------------------------------
*/

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function normalizeLongitude(longitude: number): number {
  let result = longitude % 360;

  if (result < 0) {
    result += 360;
  }

  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);

  result.setUTCFullYear(result.getUTCFullYear() + years);

  return result;
}

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 86_400_000;
}

function yearsBetween(start: Date, end: Date): number {
  return daysBetween(start, end) / 365.2425;
}

function parseNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

/*
|--------------------------------------------------------------------------
| ZODIAC / NAKSHATRA
|--------------------------------------------------------------------------
*/

function getZodiacPosition(longitude: number): ZodiacPosition {
  const normalized = normalizeLongitude(longitude);

  const signIndex = Math.floor(normalized / 30);

  const degree = normalized - signIndex * 30;

  return {
    sign: ZODIAC_SIGNS[signIndex],
    signIndex,
    degree: round(degree, 4),
    longitude: round(normalized, 4),
    formatted: `${ZODIAC_SIGNS[signIndex]} ${degree.toFixed(2)}°`,
  };
}

function getNakshatra(longitude: number): Nakshatra {
  const normalized = normalizeLongitude(longitude);

  const nakshatraSize = 360 / 27;

  const index = Math.min(26, Math.floor(normalized / nakshatraSize));

  const degreesIntoNakshatra = normalized - index * nakshatraSize;

  const pada = Math.min(
    4,
    Math.floor(degreesIntoNakshatra / (nakshatraSize / 4)) + 1,
  );

  const data = NAKSHATRAS[index];

  return {
    index,
    name: data.name,
    lord: data.lord,
    pada,
    degreesIntoNakshatra: round(degreesIntoNakshatra, 4),
    formatted: `${data.name} Pada ${pada} (${data.lord})`,
  };
}

/*
|--------------------------------------------------------------------------
| TIMEZONE
|--------------------------------------------------------------------------
*/

function parseTimezone(location: BirthLocation): number {
  const timezone = location.timezone;

  if (typeof timezone === "number") {
    return timezone;
  }

  const parsed = Number(timezone);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getTimezoneId(location: BirthLocation): string | null {
  return location.timezoneId || null;
}

function buildUtcBirthDate(
  dateOfBirth: string,
  timeOfBirth: string,
  timezone: number,
): Date {
  const [year, month, day] = dateOfBirth.split("-").map(Number);

  const [hours, minutes, seconds = 0] = timeOfBirth.split(":").map(Number);

  const localMillis = Date.UTC(
    year,
    month - 1,
    day,
    hours || 0,
    minutes || 0,
    seconds || 0,
  );

  return new Date(localMillis - timezone * 60 * 60 * 1000);
}

/*
|--------------------------------------------------------------------------
| SWISS EPHEMERIS
|--------------------------------------------------------------------------
*/

function getSwissPlanetId(swe: SwissEph, name: string): number {
  const map: Record<string, number> = {
    Sun: swe.SE_SUN,
    Moon: swe.SE_MOON,
    Mars: swe.SE_MARS,
    Mercury: swe.SE_MERCURY,
    Jupiter: swe.SE_JUPITER,
    Venus: swe.SE_VENUS,
    Saturn: swe.SE_SATURN,
    Uranus: swe.SE_URANUS,
    Neptune: swe.SE_NEPTUNE,
    Pluto: swe.SE_PLUTO,
  };

  const planetId = map[name];

  if (typeof planetId !== "number") {
    throw new Error(`UNKNOWN_PLANET:${name}`);
  }

  return planetId;
}

function getPlanetSymbol(name: string): string {
  const symbols: Record<string, string> = {
    Sun: "☉",
    Moon: "☽",
    Mars: "♂",
    Mercury: "☿",
    Jupiter: "♃",
    Venus: "♀",
    Saturn: "♄",
    Uranus: "♅",
    Neptune: "♆",
    Pluto: "♇",
    Rahu: "☊",
    Ketu: "☋",
  };

  return symbols[name] || "";
}

function findWholeSignHouse(
  planetLongitude: number,
  ascendantLongitude: number,
): number {
  const planetSign = Math.floor(normalizeLongitude(planetLongitude) / 30);

  const ascendantSign = Math.floor(normalizeLongitude(ascendantLongitude) / 30);

  return ((planetSign - ascendantSign + 12) % 12) + 1;
}

/*
|--------------------------------------------------------------------------
| SWISS CHART CALCULATION
|--------------------------------------------------------------------------
*/

async function calculateSwissChart(profile: BirthProfile): Promise<SwissChart> {
  if (!profile.placeOfBirth) {
    throw new Error("BIRTH_LOCATION_REQUIRED");
  }

  const location = profile.placeOfBirth;

  const timezone = parseTimezone(location);

  const timezoneId = getTimezoneId(location);

  const utcDate = buildUtcBirthDate(
    profile.dateOfBirth,
    profile.timeOfBirth,
    timezone,
  );

  const year = utcDate.getUTCFullYear();

  const month = utcDate.getUTCMonth() + 1;

  const day = utcDate.getUTCDate();

  const hour =
    utcDate.getUTCHours() +
    utcDate.getUTCMinutes() / 60 +
    utcDate.getUTCSeconds() / 3600;

  const swe = new SwissEph();

  try {
    await swe.initSwissEph();

    swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

    const julianDay = swe.julday(year, month, day, hour);

    const flags = swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL | swe.SEFLG_SPEED;

    const planetNames = [
      "Sun",
      "Moon",
      "Mars",
      "Mercury",
      "Jupiter",
      "Venus",
      "Saturn",
      "Uranus",
      "Neptune",
      "Pluto",
    ];

    const planets: Record<string, PlanetData> = {};

    /*
    |--------------------------------------------------------------------------
    | PLANETS
    |--------------------------------------------------------------------------
    */

    for (const planetName of planetNames) {
      const planetId = getSwissPlanetId(swe, planetName);

      const result = swe.calc_ut(julianDay, planetId, flags);

      const values = Array.from(result);

      if (values.length < 4) {
        throw new Error(`INVALID_SWISS_RESULT:${planetName}`);
      }

      const longitude = normalizeLongitude(parseNumber(values[0]));

      const latitude = parseNumber(values[1]);

      const distance = parseNumber(values[2]);

      const speed = parseNumber(values[3]);

      planets[planetName] = {
        name: planetName,

        symbol: getPlanetSymbol(planetName),

        longitude,

        latitude,

        distance,

        speed,

        zodiac: getZodiacPosition(longitude),

        nakshatra: getNakshatra(longitude),

        house: null,

        retrograde: speed < 0,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | TRUE NODE / RAHU / KETU
    |--------------------------------------------------------------------------
    */

    const nodeResult = swe.calc_ut(julianDay, swe.SE_TRUE_NODE, flags);

    const nodeValues = Array.from(nodeResult);

    if (nodeValues.length < 1) {
      throw new Error("INVALID_SWISS_NODE_RESULT");
    }

    const rahuLongitude = normalizeLongitude(parseNumber(nodeValues[0]));

    const ketuLongitude = normalizeLongitude(rahuLongitude + 180);

    planets.Rahu = {
      name: "Rahu",

      symbol: "☊",

      longitude: rahuLongitude,

      zodiac: getZodiacPosition(rahuLongitude),

      nakshatra: getNakshatra(rahuLongitude),

      house: null,

      retrograde: true,
    };

    planets.Ketu = {
      name: "Ketu",

      symbol: "☋",

      longitude: ketuLongitude,

      zodiac: getZodiacPosition(ketuLongitude),

      nakshatra: getNakshatra(ketuLongitude),

      house: null,

      retrograde: true,
    };

    /*
    |--------------------------------------------------------------------------
    | HOUSES
    |--------------------------------------------------------------------------
    */

    const housesResult = swe.houses(
      julianDay,
      location.latitude,
      location.longitude,
      "P",
    );

    const houseResultRecord = housesResult as unknown as {
      cusps?: ArrayLike<number>;
      ascendant?: number;
      mc?: number;
    };

    const cusps = houseResultRecord.cusps
      ? Array.from(houseResultRecord.cusps)
      : [];

    if (cusps.length < 12) {
      throw new Error("INVALID_SWISS_HOUSE_RESULT");
    }

    const ascendantLongitude = normalizeLongitude(
      parseNumber(houseResultRecord.ascendant, 0),
    );

    const midheavenLongitude = normalizeLongitude(
      parseNumber(houseResultRecord.mc, 0),
    );

    const houses: HouseData[] = Array.from({ length: 12 }, (_, index) => {
      const longitude = normalizeLongitude(parseNumber(cusps[index], 0));

      return {
        house: index + 1,

        longitude,

        zodiac: getZodiacPosition(longitude),
      };
    });

    /*
    |--------------------------------------------------------------------------
    | WHOLE-SIGN VEDIC HOUSES
    |--------------------------------------------------------------------------
    */

    for (const planet of Object.values(planets)) {
      planet.house = findWholeSignHouse(planet.longitude, ascendantLongitude);
    }

    const ascendant = {
      longitude: ascendantLongitude,

      zodiac: getZodiacPosition(ascendantLongitude),
    };

    const midheaven = {
      longitude: midheavenLongitude,

      zodiac: getZodiacPosition(midheavenLongitude),
    };

    /*
    |--------------------------------------------------------------------------
    | VIMSHOTTARI DASHA
    |--------------------------------------------------------------------------
    */

    const moon = planets.Moon;

    if (!moon) {
      throw new Error("MOON_CALCULATION_FAILED");
    }

    const calculationDate = new Date();

    const dasha = getVimshottariDasha(
      moon.nakshatra,
      profile.dateOfBirth,
      profile.timeOfBirth,
      timezone,
      calculationDate,
    );

    /*
    |--------------------------------------------------------------------------
    | AYANAMSA
    |--------------------------------------------------------------------------
    */

    let ayanamsaValue: number | null = null;

    try {
      const value = swe.get_ayanamsa(julianDay);

      if (typeof value === "number" && Number.isFinite(value)) {
        ayanamsaValue = round(value, 6);
      }
    } catch {
      ayanamsaValue = null;
    }

    return {
      calculation: {
        julianDay,

        utcBirthTime: utcDate.toISOString(),

        timezone,

        timezoneId,

        latitude: location.latitude,

        longitude: location.longitude,

        houseSystem: "Placidus calculation / Whole Sign Vedic interpretation",

        zodiac: "Sidereal",

        ayanamsa: "Lahiri",

        ayanamsaValue,

        swissEphemeris: "Swiss Ephemeris",
      },

      ascendant,

      midheaven,

      planets,

      houses,

      dasha,
    };
  } finally {
    try {
      swe.close();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

/*
|--------------------------------------------------------------------------
| VIMSHOTTARI DASHA
|--------------------------------------------------------------------------
*/

function getSequenceIndex(lord: string): number {
  const index = DASHA_SEQUENCE.indexOf(lord);

  return index >= 0 ? index : 0;
}

function getVimshottariDasha(
  moonNakshatra: Nakshatra,
  dateOfBirth: string,
  timeOfBirth: string,
  timezone: number,
  calculationDate: Date,
): DashaData {
  const birthDate = buildUtcBirthDate(dateOfBirth, timeOfBirth, timezone);

  const nakshatraLord = moonNakshatra.lord;

  const nakshatraSize = 360 / 27;

  const fractionElapsed = Math.min(
    1,
    Math.max(0, moonNakshatra.degreesIntoNakshatra / nakshatraSize),
  );

  const fullYears = DASHA_YEARS[nakshatraLord] || 7;

  const remainingYears = fullYears * (1 - fractionElapsed);

  const elapsedYears = fullYears - remainingYears;

  const firstMahadashaStart = addYears(birthDate, -elapsedYears);

  const timelineEnd = addYears(calculationDate, 30);

  const timeline: DashaEntry[] = [];

  type MahaEntry = {
    lord: string;
    start: Date;
    end: Date;
  };

  const mahaPeriods: MahaEntry[] = [];

  let currentStart = new Date(firstMahadashaStart);

  let sequenceIndex = getSequenceIndex(nakshatraLord);

  for (let cycle = 0; cycle < 5 && currentStart < timelineEnd; cycle += 1) {
    for (let i = 0; i < DASHA_SEQUENCE.length; i += 1) {
      const lord = DASHA_SEQUENCE[(sequenceIndex + i) % DASHA_SEQUENCE.length];

      const durationYears = DASHA_YEARS[lord];

      const currentEnd = addYears(currentStart, durationYears);

      mahaPeriods.push({
        lord,
        start: new Date(currentStart),
        end: new Date(currentEnd),
      });

      const mahaDays = Math.max(1, daysBetween(currentStart, currentEnd));

      let antarStart = new Date(currentStart);

      for (let j = 0; j < DASHA_SEQUENCE.length; j += 1) {
        const antarLord =
          DASHA_SEQUENCE[(sequenceIndex + i + j) % DASHA_SEQUENCE.length];

        const antarDays = mahaDays * (DASHA_YEARS[antarLord] / 120);

        let antarEnd = new Date(antarStart.getTime() + antarDays * 86_400_000);

        if (antarEnd > currentEnd) {
          antarEnd = new Date(currentEnd);
        }

        timeline.push({
          lord: `${lord}/${antarLord}`,

          start: formatDate(antarStart),

          end: formatDate(antarEnd),
        });

        antarStart = new Date(antarEnd);
      }

      currentStart = new Date(currentEnd);

      if (currentStart >= timelineEnd) {
        break;
      }
    }

    sequenceIndex = 0;
  }

  /*
  |--------------------------------------------------------------------------
  | CURRENT MAHADASHA
  |--------------------------------------------------------------------------
  */

  const currentMaha = mahaPeriods.find(
    (period) => calculationDate >= period.start && calculationDate < period.end,
  );

  let mahadasha:
    | (DashaPeriod & {
        remainingYears: number;
      })
    | null = null;

  if (currentMaha) {
    mahadasha = {
      lord: currentMaha.lord,

      start: formatDate(currentMaha.start),

      end: formatDate(currentMaha.end),

      remainingYears: Math.max(
        0,
        yearsBetween(calculationDate, currentMaha.end),
      ),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CURRENT ANTARDASHA
  |--------------------------------------------------------------------------
  */

  let antardasha: DashaPeriod | null = null;

  if (currentMaha) {
    const currentMahaStart = currentMaha.start;

    const currentMahaEnd = currentMaha.end;

    const currentMahaLord = currentMaha.lord;

    const currentAntar = timeline.find((entry) => {
      const [mahaLord, antarLord] = entry.lord.split("/");

      if (mahaLord !== currentMahaLord) {
        return false;
      }

      const start = new Date(`${entry.start}T00:00:00Z`);

      const end = new Date(`${entry.end}T23:59:59Z`);

      return (
        start >= currentMahaStart &&
        end <= addDays(currentMahaEnd, 1) &&
        calculationDate >= start &&
        calculationDate <= end &&
        Boolean(antarLord)
      );
    });

    if (currentAntar) {
      antardasha = {
        lord: currentAntar.lord.split("/")[1] || "",

        start: currentAntar.start,

        end: currentAntar.end,
      };
    }
  }

  return {
    moonNakshatra,

    mahadasha,

    antardasha,

    timeline,
  };
}

/*
|--------------------------------------------------------------------------
| CHART SERIALIZATION
|--------------------------------------------------------------------------
*/

function serializeChartForAI(chart: SwissChart): string {
  const planets = Object.values(chart.planets).map((planet) => ({
    name: planet.name,

    sign: planet.zodiac.sign,

    degree: round(planet.zodiac.degree, 2),

    longitude: round(planet.longitude, 2),

    house: planet.house,

    nakshatra: planet.nakshatra.name,

    nakshatraLord: planet.nakshatra.lord,

    pada: planet.nakshatra.pada,

    retrograde: planet.retrograde ?? false,
  }));

  return JSON.stringify(
    {
      ascendant: {
        sign: chart.ascendant.zodiac.sign,

        degree: round(chart.ascendant.zodiac.degree, 2),

        longitude: round(chart.ascendant.longitude, 2),
      },

      midheaven: {
        sign: chart.midheaven.zodiac.sign,

        degree: round(chart.midheaven.zodiac.degree, 2),

        longitude: round(chart.midheaven.longitude, 2),
      },

      planets,

      houses: chart.houses.map((house) => ({
        house: house.house,

        sign: house.zodiac.sign,

        degree: round(house.zodiac.degree, 2),

        longitude: round(house.longitude, 2),
      })),

      dasha: {
        moonNakshatra: chart.dasha.moonNakshatra.name,

        moonNakshatraLord: chart.dasha.moonNakshatra.lord,

        currentMahadasha: chart.dasha.mahadasha,

        currentAntardasha: chart.dasha.antardasha,

        timeline: chart.dasha.timeline,
      },

      calculation: {
        zodiac: chart.calculation.zodiac,

        ayanamsa: chart.calculation.ayanamsa,

        ayanamsaValue: chart.calculation.ayanamsaValue,

        houseSystem: chart.calculation.houseSystem,
      },
    },
    null,
    2,
  );
}

/*
|--------------------------------------------------------------------------
| CONVERSATION MEMORY
|--------------------------------------------------------------------------
*/

function buildConversationMemory(
  memory: ConversationMemory | null | undefined,
): string {
  if (!memory?.summary) {
    return "No previous conversation memory is available.";
  }

  return clampString(memory.summary, MAX_SUMMARY_CHARS);
}

/*
|--------------------------------------------------------------------------
| ASTROLOGY CONTEXT
|--------------------------------------------------------------------------
*/

function buildAstrologyContext(
  profile: BirthProfile,
  chart: SwissChart,
  language: ResponseLanguage,
  conversationMemory: string,
): string {
  const chartData = serializeChartForAI(chart);

  const languageInstruction =
    language === "hi"
      ? `
RESPONSE LANGUAGE:
Hindi.

Use natural, fluent Hindi.

English astrology terms may be used where
they are clearer, for example:

Mahadasha
Antardasha
Ascendant
Nakshatra
career
business
relationship

Do not switch the entire answer to English
unless the user asks for English.
`
      : `
RESPONSE LANGUAGE:
English.

Use clear, natural English.
`;

  return `
==================================================
ASTROAI VEDIC ASTROLOGY CONTEXT
==================================================

${ASTROLOGY_SYSTEM_RULES}

==================================================
INTERPRETATION METHOD
==================================================

For important questions, interpret information
in this order:

CHART FACT
→ ASTROLOGICAL MEANING
→ CONNECTION WITH OTHER RELEVANT FACTORS
→ EFFECT ON THE USER'S SPECIFIC QUESTION
→ PRACTICAL CONCLUSION

Do not expose internal reasoning,
hidden chain-of-thought,
or private reasoning steps.

Give the useful conclusion with concise
supporting explanation.

==================================================
BIRTH PROFILE
==================================================

Name:
${profile.name}

Gender:
${profile.gender || "Not specified"}

Date of birth:
${profile.dateOfBirth}

Time of birth:
${profile.timeOfBirth}

Place:
${profile.placeOfBirth?.displayName || "Not available"}

Latitude:
${profile.placeOfBirth?.latitude ?? "Not available"}

Longitude:
${profile.placeOfBirth?.longitude ?? "Not available"}

Timezone:
${profile.placeOfBirth?.timezone ?? "Not available"}

Timezone ID:
${profile.placeOfBirth?.timezoneId ?? "Not available"}

==================================================
CALCULATED VEDIC CHART
==================================================

${chartData}

==================================================
CONVERSATION MEMORY
==================================================

${conversationMemory}

==================================================
CURRENT DATE
==================================================

${new Date().toISOString().slice(0, 10)}

==================================================
LANGUAGE
==================================================

${languageInstruction}

==================================================
IMPORTANT
==================================================

The chart above contains calculated
astrological facts.

Do not recalculate the chart from
the birth details.

Do not invent missing planetary
positions, houses, Dashas, Nakshatras,
yogas or aspects.

Use the supplied chart as the source
of astrological facts.

The goal is NOT to list everything
in the chart.

Select the factors relevant to the
user's question and explain how they
connect.

Be specific and personalized.

Avoid generic horoscope language
when chart-specific information
is available.
`;
}

/*
|--------------------------------------------------------------------------
| ANSWER INSTRUCTION
|--------------------------------------------------------------------------
*/

function buildAstroAnswerInstruction(
  language: ResponseLanguage,
  conversationTopic: string,
): string {
  const languageName = language === "hi" ? "Hindi" : "English";

  return `
Return ONLY valid JSON.

Do not wrap the JSON in markdown.

JSON schema:

{
  "answer": "string",
  "conversationTopic": "string"
}

LANGUAGE:
${languageName}

The "answer" field must contain
the complete user-facing astrology answer.

The "conversationTopic" field should
be a short description of the current
astrology discussion topic.

Previous conversation topic:
${conversationTopic || "None"}

Answer requirements:

- Answer the user's exact question first.
- Use actual chart evidence.
- Be specific and personalized.
- Connect multiple relevant chart factors
  when appropriate.
- Explain the relevant astrological factors
  clearly.
- Use Dasha timing when relevant.
- Distinguish tendencies from guarantees.
- Do not expose internal reasoning.
- Do not mention API, Gemini, Groq, backend,
  prompts, system rules, model names or
  implementation.
- Do not invent calculations.
- Do not make generic statements when
  chart-specific evidence is available.
- Keep simple questions concise.
- For detailed questions, provide enough
  explanation to feel complete.
- Finish the answer fully.

The response should feel like a thoughtful
Vedic astrology reading, not like a generic
horoscope.
`;
}

/*
|--------------------------------------------------------------------------
| GEMINI API KEYS
|--------------------------------------------------------------------------
*/

function getGeminiApiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY1,
    process.env.GEMINI_API_KEY2,
    process.env.GEMINI_API_KEY3,
    process.env.GEMINI_API_KEY4,
    process.env.GEMINI_API_KEY5,
  ];

  return [
    ...new Set(
      keys
        .map((key) => key?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

/*
|--------------------------------------------------------------------------
| GEMINI RESPONSE
|--------------------------------------------------------------------------
*/

function extractGeminiText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function cleanJsonText(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  }

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

function parseAstroAnswerPayload(text: string): AstroAnswerPayload {
  const cleaned = cleanJsonText(text);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");

    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("INVALID_ASTRO_RESPONSE_JSON");
    }

    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("INVALID_ASTRO_RESPONSE");
  }

  const value = parsed as Record<string, unknown>;

  const answer = typeof value.answer === "string" ? value.answer.trim() : "";

  const conversationTopic =
    typeof value.conversationTopic === "string"
      ? value.conversationTopic.trim()
      : "";

  if (!answer) {
    throw new Error("EMPTY_ASTRO_ANSWER");
  }

  return {
    answer,

    conversationTopic: conversationTopic || "Vedic astrology",
  };
}

/*
|--------------------------------------------------------------------------
| GEMINI ERRORS
|--------------------------------------------------------------------------
*/

function getGeminiErrorInfo(error: unknown): GeminiErrorInfo {
  return {
    status: getErrorStatus(error),

    message: getErrorMessage(error),
  };
}

function isRetryableGeminiStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/*
|--------------------------------------------------------------------------
| GEMINI REQUEST
|--------------------------------------------------------------------------
*/

async function requestGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  question: string,
): Promise<GeminiResponse> {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: systemPrompt,
              },
            ],
          },

          contents: [
            {
              role: "user",

              parts: [
                {
                  text: question,
                },
              ],
            },
          ],

          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,

            temperature: 0.75,

            responseMimeType: "application/json",

            thinkingConfig: {
              thinkingLevel: getThinkingLevel(),
            },
          },
        }),

        signal: controller.signal,
      },
    );

    const text = await response.text();

    let data: unknown = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        typeof data === "object" && data !== null && "error" in data
          ? JSON.stringify(
              (
                data as {
                  error?: unknown;
                }
              ).error,
            )
          : text;

      const error = new Error(
        message || `Gemini request failed with status ${response.status}`,
      );

      (
        error as Error & {
          status?: number;
        }
      ).status = response.status;

      throw error;
    }

    return data as GeminiResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/*
|--------------------------------------------------------------------------
| GEMINI FULL FALLBACK
|--------------------------------------------------------------------------
|
| 3.8
|   -> key 1
|   -> retry
|   -> key 2
|   -> retry
|   -> ...
|
| 3.7
|   -> all keys
|
| 3.6
|   -> all keys
|
| THEN ONLY:
|
| Groq
|--------------------------------------------------------------------------
*/

async function requestGeminiWithKeyRotation(
  systemPrompt: string,
  question: string,
): Promise<{
  payload: AstroAnswerPayload;
  model: string;
}> {
  const apiKeys = getGeminiApiKeys();

  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
  }

  let lastError: unknown = null;

  for (const model of GEMINI_MODEL_CHAIN) {
    console.log(`[Gemini] Trying model: ${model}`);

    for (const apiKey of apiKeys) {
      for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
        try {
          const response = await requestGemini(
            apiKey,
            model,
            systemPrompt,
            question,
          );

          const text = extractGeminiText(response);

          if (!text) {
            throw new Error("GEMINI_EMPTY_RESPONSE");
          }

          const payload = parseAstroAnswerPayload(text);

          console.log(`[Gemini] Success: ${model}`);

          return {
            payload,
            model,
          };
        } catch (error) {
          lastError = error;

          const info = getGeminiErrorInfo(error);

          console.warn(
            `[Gemini] Failed model=${model}, status=${info.status}, attempt=${attempt + 1}: ${info.message}`,
          );

          /*
           * Non-retryable 4xx.
           *
           * Move to next key/model.
           */
          if (
            info.status >= 400 &&
            info.status < 500 &&
            info.status !== 408 &&
            info.status !== 409 &&
            info.status !== 429
          ) {
            break;
          }

          if (!isRetryableGeminiStatus(info.status)) {
            break;
          }

          if (attempt >= MAX_GEMINI_RETRIES) {
            break;
          }

          await sleep(GEMINI_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("GEMINI_ALL_MODELS_FAILED");
}

/*
|--------------------------------------------------------------------------
| GROQ
|--------------------------------------------------------------------------
*/

function buildGroqMessages(
  astrologyContext: string,
  answerInstruction: string,
  question: string,
): {
  role: "system" | "user";
  content: string;
}[] {
  return [
    {
      role: "system",

      content: `
${astrologyContext}

==================================================
ANSWER FORMAT
==================================================

${answerInstruction}
`,
    },

    {
      role: "user",

      content: question,
    },
  ];
}

/*
|--------------------------------------------------------------------------
| LOCALIZED ERRORS
|--------------------------------------------------------------------------
*/

function getLocalizedError(
  language: ResponseLanguage,
  type: "balance" | "unavailable" | "profile" | "location" | "astrology",
): string {
  if (language === "hi") {
    switch (type) {
      case "balance":
        return "आपके API अकाउंट का बैलेंस या क्रेडिट कम है। कृपया अपनी API billing और balance जाँचें।";

      case "profile":
        return "कृपया अपनी जन्म तारीख, जन्म समय और जन्म स्थान की जानकारी पूरी करें।";

      case "location":
        return "जन्म कुंडली बनाने के लिए जन्म स्थान की जानकारी आवश्यक है।";

      case "astrology":
        return "कुंडली की गणना करते समय समस्या आई। कृपया जन्म विवरण जाँचकर दोबारा प्रयास करें।";

      default:
        return "AstroAI अभी उत्तर तैयार नहीं कर पा रहा है। कृपया थोड़ी देर बाद दोबारा प्रयास करें।";
    }
  }

  switch (type) {
    case "balance":
      return "Your API account balance or credits are low. Please check your API billing and balance.";

    case "profile":
      return "Please complete your date of birth, time of birth, and birth place.";

    case "location":
      return "Birth location is required to calculate your birth chart.";

    case "astrology":
      return "There was a problem calculating your birth chart. Please check your birth details and try again.";

    default:
      return "AstroAI could not prepare an answer right now. Please try again shortly.";
  }
}

/*
|--------------------------------------------------------------------------
| EMAIL
|--------------------------------------------------------------------------
*/

async function maybeSendEmail({
  profile,
  question,
  answer,
}: {
  profile: BirthProfile;
  question: string;
  answer: string;
}): Promise<void> {
  if (!profile.placeOfBirth) {
    console.log("📧 EMAIL: place of birth missing, skipping");

    return;
  }

  console.log("📧 EMAIL: starting send...", {
    name: profile.name,
    questionLength: question.length,
    answerLength: answer.length,
  });

  try {
    const emailProfile = {
      name: profile.name,

      dateOfBirth: profile.dateOfBirth,

      timeOfBirth: profile.timeOfBirth,

      placeOfBirth: {
        name: profile.placeOfBirth.name,

        displayName: profile.placeOfBirth.displayName,
      },
    };

    await sendAstroEmail({
      profile: emailProfile,
      question,
      answer,
    });

    console.log("✅ EMAIL: sendAstroEmail completed successfully");
  } catch (error) {
    console.error("❌ EMAIL SEND FAILED:", error);
  }
}

/*
|--------------------------------------------------------------------------
| CONVERSATION TOPIC
|--------------------------------------------------------------------------
*/

function normalizeConversationTopic(value: string): string {
  return clampString(
    value.replace(/\s+/g, " ").trim(),
    MAX_CONVERSATION_TOPIC_CHARS,
  );
}

/*
|--------------------------------------------------------------------------
| REQUEST VALIDATION
|--------------------------------------------------------------------------
*/

function validateProfile(profile: BirthProfile): void {
  if (!profile || typeof profile !== "object") {
    throw new Error("INVALID_PROFILE");
  }

  if (!profile.dateOfBirth || !profile.timeOfBirth) {
    throw new Error("INVALID_PROFILE");
  }

  if (!profile.placeOfBirth) {
    throw new Error("BIRTH_LOCATION_REQUIRED");
  }
}

function validateMessages(messages: ChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("MESSAGES_REQUIRED");
  }

  if (messages.length > MAX_MESSAGES) {
    throw new Error("TOO_MANY_MESSAGES");
  }

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      throw new Error("INVALID_MESSAGE_ROLE");
    }

    if (
      typeof message.content !== "string" ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new Error("INVALID_MESSAGE");
    }
  }
}

/*
|--------------------------------------------------------------------------
| POST
|--------------------------------------------------------------------------
*/

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const language = getLanguage(body.language);

    const profile = body.profile as BirthProfile | undefined;

    const messages = body.messages as ChatMessage[] | undefined;

    /*
    |--------------------------------------------------------------------------
    | PROFILE
    |--------------------------------------------------------------------------
    */

    if (!profile) {
      return NextResponse.json(
        {
          error: getLocalizedError(language, "profile"),
        },
        {
          status: 400,
        },
      );
    }

    try {
      validateProfile(profile);
    } catch (error) {
      const message = getErrorMessage(error);

      if (message === "BIRTH_LOCATION_REQUIRED") {
        return NextResponse.json(
          {
            error: getLocalizedError(language, "location"),
          },
          {
            status: 400,
          },
        );
      }

      return NextResponse.json(
        {
          error: getLocalizedError(language, "profile"),
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | MESSAGES
    |--------------------------------------------------------------------------
    */

    if (!messages) {
      return NextResponse.json(
        {
          error:
            language === "hi"
              ? "कृपया अपना प्रश्न भेजें।"
              : "Please send your question.",
        },
        {
          status: 400,
        },
      );
    }

    try {
      validateMessages(messages);
    } catch {
      return NextResponse.json(
        {
          error:
            language === "hi"
              ? "संदेश मान्य नहीं है।"
              : "The message is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | LATEST USER QUESTION
    |--------------------------------------------------------------------------
    */

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return NextResponse.json(
        {
          error:
            language === "hi"
              ? "कृपया अपना प्रश्न भेजें।"
              : "Please send your question.",
        },
        {
          status: 400,
        },
      );
    }

    const question = latestUserMessage.content.trim();

    /*
    |--------------------------------------------------------------------------
    | CONVERSATION KEY
    |--------------------------------------------------------------------------
    */

    const conversationKey = [
      profile.name,

      profile.dateOfBirth,

      profile.timeOfBirth,

      profile.placeOfBirth?.latitude,

      profile.placeOfBirth?.longitude,
    ]
      .map(String)
      .join("|");

    /*
    |--------------------------------------------------------------------------
    | CONVERSATION MEMORY
    |--------------------------------------------------------------------------
    */

    let conversationMemory: ConversationMemory | null = null;

    try {
      conversationMemory = getConversationMemory(conversationKey);
    } catch (error) {
      console.warn("[Memory] Read failed:", getErrorMessage(error));
    }

    /*
    |--------------------------------------------------------------------------
    | SWISS CHART
    |--------------------------------------------------------------------------
    */

    let chart: SwissChart;

    try {
      chart = await calculateSwissChart(profile);
    } catch (error) {
      console.error("[Swiss Ephemeris] Error:", error);

      const errorMessage = getErrorMessage(error);

      console.error("[Swiss Ephemeris] Details:", errorMessage);

      return NextResponse.json(
        {
          error: getLocalizedError(language, "astrology"),
        },
        {
          status: 500,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PREVIOUS TOPIC
    |--------------------------------------------------------------------------
    */

    let previousTopic = "Vedic astrology";

    if (conversationMemory?.summary) {
      const topicMatch = conversationMemory.summary.match(
        /(?:topic|conversation topic)\s*:\s*(.+)/i,
      );

      if (topicMatch?.[1]) {
        previousTopic = normalizeConversationTopic(topicMatch[1]);
      }
    }

    /*
    |--------------------------------------------------------------------------
    | ASTROLOGY CONTEXT
    |--------------------------------------------------------------------------
    */

    const astrologyContext = buildAstrologyContext(
      profile,
      chart,
      language,
      buildConversationMemory(conversationMemory),
    );

    const answerInstruction = buildAstroAnswerInstruction(
      language,
      previousTopic,
    );

    /*
    |--------------------------------------------------------------------------
    | GEMINI FIRST
    |--------------------------------------------------------------------------
    */

    let answerPayload: AstroAnswerPayload | null = null;

    let provider: "gemini" | "groq" = "gemini";

    let providerModel = "";

    try {
      const geminiResult = await requestGeminiWithKeyRotation(
        astrologyContext,

        `
${answerInstruction}

USER QUESTION:

${question}
`,
      );

      answerPayload = geminiResult.payload;

      provider = "gemini";

      providerModel = geminiResult.model;
    } catch (geminiError) {
      /*
       * Gemini is completely exhausted.
       *
       * ONLY NOW do we use Groq.
       */
      console.error(
        "[Gemini] All Gemini attempts failed. Moving to Groq.",
        getErrorMessage(geminiError),
      );

      /*
      |--------------------------------------------------------------------------
      | GROQ PROVIDER FALLBACK
      |--------------------------------------------------------------------------
      */

      try {
        const groqResult = await callGroq(
          buildGroqMessages(astrologyContext, answerInstruction, question),
        );

        answerPayload = parseAstroAnswerPayload(groqResult.answer);

        provider = "groq";

        providerModel = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
      } catch (groqError) {
        const groqMessage = getErrorMessage(groqError);

        console.error("[Groq] Failed:", groqMessage);

        if (groqMessage === "GROQ_INSUFFICIENT_BALANCE") {
          return NextResponse.json(
            {
              error: getLocalizedError(language, "balance"),
            },
            {
              status: 402,
            },
          );
        }

        if (groqMessage === "GROQ_API_KEY_NOT_CONFIGURED") {
          return NextResponse.json(
            {
              error: getLocalizedError(language, "unavailable"),
            },
            {
              status: 503,
            },
          );
        }

        return NextResponse.json(
          {
            error: getLocalizedError(language, "unavailable"),
          },
          {
            status: 503,
          },
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | SAFETY CHECK
    |--------------------------------------------------------------------------
    */

    if (!answerPayload) {
      return NextResponse.json(
        {
          error: getLocalizedError(language, "unavailable"),
        },
        {
          status: 503,
        },
      );
    }

    const answer = answerPayload.answer.trim();

    /*
    |--------------------------------------------------------------------------
    | UPDATED TOPIC
    |--------------------------------------------------------------------------
    */

    const updatedConversationTopic = normalizeConversationTopic(
      answerPayload.conversationTopic || previousTopic,
    );

    /*
    |--------------------------------------------------------------------------
    | SAVE CONVERSATION MEMORY
    |--------------------------------------------------------------------------
    */

    const memoryText = `
Topic: ${updatedConversationTopic}

Latest user question:
${question}

Latest astrology answer:
${answer}
`.trim();

    try {
      setConversationMemory(conversationKey, {
        summary: clampString(memoryText, MAX_SUMMARY_CHARS),

        summaryMessageCount: messages.length,
      });
    } catch (error) {
      console.warn("[Memory] Write failed:", getErrorMessage(error));
    }

    /*
    |--------------------------------------------------------------------------
    | OPTIONAL EMAIL
    |--------------------------------------------------------------------------
    */

    await maybeSendEmail({
      profile,
      question,
      answer,
    });

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      message: answer,

      language,

      chart,

      conversationTopic: updatedConversationTopic,

      conversationSummary: updatedConversationTopic,

      conversationSummaryMessageCount: messages.length,

      conversationSummaryUpdated: true,

      provider,

      model: providerModel,
    });
  } catch (error) {
    console.error("[/api/chat] Unexpected error:", error);

    return NextResponse.json(
      {
        error: "AstroAI could not process the request.",
      },
      {
        status: 500,
      },
    );
  }
}
