import { NextRequest, NextResponse } from "next/server";
import SwissEph from "swisseph-wasm";

export const runtime = "nodejs";

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type ResponseLanguage = "en" | "hi";

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
  house?: number | null;
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
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const MAX_GEMINI_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

const MAX_MESSAGES = 30;
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
] as const;

/*
|--------------------------------------------------------------------------
| VALIDATION HELPERS
|--------------------------------------------------------------------------
*/

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(
  value: unknown,
): string | undefined {
  return typeof value === "string"
    ? value
    : undefined;
}

function isResponseLanguage(
  value: unknown,
): value is ResponseLanguage {
  return (
    value === "en" ||
    value === "hi"
  );
}

function isChatMessage(
  value: unknown,
): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.role === "user" ||
      value.role === "assistant") &&
    typeof value.content === "string"
  );
}

function parseChatMessages(
  value: unknown,
): ChatMessage[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (!value.every(isChatMessage)) {
    return null;
  }

  return value;
}

function isBirthLocation(
  value: unknown,
): value is BirthLocation {
  if (!isRecord(value)) {
    return false;
  }

  const latitude =
    value.latitude;

  const longitude =
    value.longitude;

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | timezone can now be:
  |
  | number  -> e.g. 5.5
  | string  -> e.g. "Europe/London"
  |
  */

  const validTimezone =
    (
      typeof value.timezone ===
        "number" &&
      Number.isFinite(
        value.timezone,
      )
    ) ||
    (
      typeof value.timezone ===
        "string" &&
      value.timezone.trim().length >
        0
    );

  return (
    typeof value.name ===
      "string" &&
    value.name.trim().length >
      0 &&
    typeof value.displayName ===
      "string" &&
    value.displayName.trim().length >
      0 &&
    typeof latitude ===
      "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude ===
      "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    validTimezone &&
    (
      value.placeId ===
        undefined ||
      typeof value.placeId ===
        "string"
    ) &&
    (
      value.timezoneId ===
        undefined ||
      value.timezoneId ===
        null ||
      typeof value.timezoneId ===
        "string"
    )
  );
}

function isBirthProfile(
  value: unknown,
): value is BirthProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name ===
      "string" &&
    typeof value.dateOfBirth ===
      "string" &&
    typeof value.timeOfBirth ===
      "string" &&
    (
      value.gender ===
        undefined ||
      typeof value.gender ===
        "string"
    ) &&
    (
      value.placeOfBirth ===
        null ||
      isBirthLocation(
        value.placeOfBirth,
      )
    )
  );
}

/*
|--------------------------------------------------------------------------
| GEMINI API KEYS
|--------------------------------------------------------------------------
*/

function getGeminiApiKeys(): string[] {
  return Object.keys(process.env)
    .filter((key) => {
      return (
        key === "GEMINI_API_KEY" ||
        /^GEMINI_API_KEY\d+$/.test(key)
      );
    })
    .sort((a, b) => {
      if (a === "GEMINI_API_KEY") {
        return -1;
      }

      if (b === "GEMINI_API_KEY") {
        return 1;
      }

      const aNumber = Number(
        a.replace(
          "GEMINI_API_KEY",
          "",
        ),
      );

      const bNumber = Number(
        b.replace(
          "GEMINI_API_KEY",
          "",
        ),
      );

      return aNumber - bNumber;
    })
    .map(
      (key) =>
        process.env[key]?.trim() ??
        "",
    )
    .filter(
      (value): value is string =>
        value.length > 0,
    );
}

/*
|--------------------------------------------------------------------------
| GENERAL HELPERS
|--------------------------------------------------------------------------
*/

function sleep(
  ms: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeDegree(
  value: number,
): number {
  let result =
    value % 360;

  if (result < 0) {
    result += 360;
  }

  return result;
}

function zodiacFromLongitude(
  longitude: number,
): ZodiacPosition {
  const normalized =
    normalizeDegree(longitude);

  const signIndex =
    Math.floor(
      normalized / 30,
    );

  const degree =
    normalized -
    signIndex * 30;

  const sign =
    ZODIAC_SIGNS[signIndex] ??
    "Unknown";

  return {
    sign,
    signIndex,
    degree:
      Number(
        degree.toFixed(6),
      ),
    longitude:
      Number(
        normalized.toFixed(6),
      ),
    formatted:
      `${degree.toFixed(2)}° ${sign}`,
  };
}

function formatDate(
  date: Date,
): string {
  return date.toISOString();
}

/*
|--------------------------------------------------------------------------
| DATE / TIME
|--------------------------------------------------------------------------
*/

function parseBirthDateTime(
  dateOfBirth: string,
  timeOfBirth: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dateParts =
    dateOfBirth
      .split("-")
      .map(Number);

  const timeParts =
    timeOfBirth
      .split(":")
      .map(Number);

  if (
    dateParts.length !== 3 ||
    dateParts.some(
      (value) =>
        !Number.isFinite(value),
    )
  ) {
    throw new Error(
      "Invalid date of birth format.",
    );
  }

  if (
    timeParts.length < 2 ||
    timeParts.some(
      (value) =>
        !Number.isFinite(value),
    )
  ) {
    throw new Error(
      "Invalid time of birth format.",
    );
  }

  const year =
    dateParts[0];

  const month =
    dateParts[1];

  const day =
    dateParts[2];

  const hour =
    timeParts[0];

  const minute =
    timeParts[1];

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error(
      "Invalid birth date or time.",
    );
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      "Birth date or time is out of range.",
    );
  }

  const calendarDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    calendarDate.getUTCFullYear() !==
      year ||
    calendarDate.getUTCMonth() !==
      month - 1 ||
    calendarDate.getUTCDate() !==
      day
  ) {
    throw new Error(
      "Invalid calendar date.",
    );
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
  };
}

/*
|--------------------------------------------------------------------------
| TIMEZONE
|--------------------------------------------------------------------------
*/

function resolveTimezoneOffset(
  timezone: number | string,
  timezoneId: string | null | undefined,
  birthDateTime: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
): number {
  /*
  |--------------------------------------------------------------------------
  | Numeric timezone
  |--------------------------------------------------------------------------
  |
  | Supports existing profiles where timezone was already stored as
  | a UTC offset, for example:
  |
  | 0
  | 1
  | 5.5
  | -4
  |
  */

  if (
    typeof timezone ===
    "number"
  ) {
    if (
      !Number.isFinite(timezone) ||
      timezone < -14 ||
      timezone > 14
    ) {
      throw new Error(
        "Invalid birth timezone.",
      );
    }

    return timezone;
  }

  /*
  |--------------------------------------------------------------------------
  | Numeric string timezone
  |--------------------------------------------------------------------------
  |
  | Supports values such as:
  |
  | "5.5"
  | "-4"
  |
  */

  const timezoneValue =
    timezone.trim();

  const numericTimezone =
    Number(timezoneValue);

  if (
    timezoneValue.length > 0 &&
    Number.isFinite(
      numericTimezone,
    )
  ) {
    if (
      numericTimezone < -14 ||
      numericTimezone > 14
    ) {
      throw new Error(
        "Invalid birth timezone.",
      );
    }

    return numericTimezone;
  }

  /*
  |--------------------------------------------------------------------------
  | IANA timezone
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | Europe/London
  | Asia/Kolkata
  | America/New_York
  |
  | The frontend timezone API returns this kind of value.
  |
  */

  const resolvedTimezoneId =
    timezoneId?.trim() ||
    timezoneValue;

  if (
    !resolvedTimezoneId
  ) {
    throw new Error(
      "Invalid birth timezone.",
    );
  }

  const {
    year,
    month,
    day,
    hour,
    minute,
  } = birthDateTime;

  /*
  |--------------------------------------------------------------------------
  | Treat the entered birth time as a wall-clock/local time.
  |--------------------------------------------------------------------------
  */

  const localAsUtc =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0,
      0,
    );

  if (
    !Number.isFinite(
      localAsUtc,
    )
  ) {
    throw new Error(
      "Unable to calculate local birth time.",
    );
  }

  try {
    const formatter =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            resolvedTimezoneId,

          calendar: "gregory",

          numberingSystem:
            "latn",

          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",

          hourCycle: "h23",
        },
      );

    const parts =
      formatter.formatToParts(
        new Date(localAsUtc),
      );

    const values:
      Record<string, string> =
      {};

    for (
      const part of parts
    ) {
      if (
        part.type !==
        "literal"
      ) {
        values[part.type] =
          part.value;
      }
    }

    const zonedYear =
      Number(
        values.year,
      );

    const zonedMonth =
      Number(
        values.month,
      );

    const zonedDay =
      Number(
        values.day,
      );

    const zonedHour =
      Number(
        values.hour,
      );

    const zonedMinute =
      Number(
        values.minute,
      );

    const zonedSecond =
      Number(
        values.second,
      );

    if (
      !Number.isInteger(
        zonedYear,
      ) ||
      !Number.isInteger(
        zonedMonth,
      ) ||
      !Number.isInteger(
        zonedDay,
      ) ||
      !Number.isInteger(
        zonedHour,
      ) ||
      !Number.isInteger(
        zonedMinute,
      ) ||
      !Number.isInteger(
        zonedSecond,
      )
    ) {
      throw new Error(
        "Unable to determine birth timezone offset.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Convert the timezone-local representation back to UTC-like
    | milliseconds and compare it with the entered wall-clock value.
    |--------------------------------------------------------------------------
    */

    const zonedAsUtc =
      Date.UTC(
        zonedYear,
        zonedMonth - 1,
        zonedDay,
        zonedHour,
        zonedMinute,
        zonedSecond,
        0,
      );

    const offset =
      (
        zonedAsUtc -
        localAsUtc
      ) /
      (
        60 *
        60 *
        1000
      );

    if (
      !Number.isFinite(
        offset,
      ) ||
      offset < -14 ||
      offset > 14
    ) {
      throw new Error(
        "Invalid birth timezone offset.",
      );
    }

    return Number(
      offset.toFixed(4),
    );
  } catch {
    throw new Error(
      `Invalid birth timezone: ${resolvedTimezoneId}`,
    );
  }
}

/*
|--------------------------------------------------------------------------
| NAKSHATRA
|--------------------------------------------------------------------------
*/

function getNakshatra(
  siderealLongitude: number,
): Nakshatra {
  const longitude =
    normalizeDegree(
      siderealLongitude,
    );

  const nakshatraSize =
    360 / 27;

  const nakshatraIndex =
    Math.floor(
      longitude /
        nakshatraSize,
    );

  const nakshatra =
    NAKSHATRAS[
      nakshatraIndex
    ];

  if (!nakshatra) {
    throw new Error(
      "Unable to determine nakshatra.",
    );
  }

  const positionInsideNakshatra =
    longitude -
    nakshatraIndex *
      nakshatraSize;

  const pada = Math.min(
    4,
    Math.floor(
      positionInsideNakshatra /
        (
          nakshatraSize / 4
        ),
    ) + 1,
  );

  return {
    index:
      nakshatraIndex,

    name:
      nakshatra.name,

    lord:
      nakshatra.lord,

    pada,

    degreesIntoNakshatra:
      Number(
        positionInsideNakshatra.toFixed(
          6,
        ),
      ),

    formatted:
      `${nakshatra.name} Pada ${pada}`,
  };
}

/*
|--------------------------------------------------------------------------
| VIMSHOTTARI DASHA
|--------------------------------------------------------------------------
*/

function getDashaSequenceFromLord(
  lord: string,
): string[] {
  const index =
    DASHA_SEQUENCE.findIndex(
      (item) =>
        item === lord,
    );

  if (index < 0) {
    return [
      ...DASHA_SEQUENCE,
    ];
  }

  return [
    ...DASHA_SEQUENCE.slice(
      index,
    ),
    ...DASHA_SEQUENCE.slice(
      0,
      index,
    ),
  ];
}

function addYears(
  date: Date,
  years: number,
): Date {
  const wholeYears =
    Math.floor(years);

  const fractionalYears =
    years - wholeYears;

  const result =
    new Date(
      date.getTime(),
    );

  result.setUTCFullYear(
    result.getUTCFullYear() +
      wholeYears,
  );

  if (
    fractionalYears === 0
  ) {
    return result;
  }

  return new Date(
    result.getTime() +
      fractionalYears *
        365.2425 *
        24 *
        60 *
        60 *
        1000,
  );
}

function getVimshottariDasha(
  birthDateUTC: Date,
  moonSiderealLongitude: number,
  calculationDate = new Date(),
): DashaData {
  const nakshatra =
    getNakshatra(
      moonSiderealLongitude,
    );

  const nakshatraSize =
    360 / 27;

  const elapsedFraction =
    nakshatra.degreesIntoNakshatra /
    nakshatraSize;

  const firstLord =
    nakshatra.lord;

  const firstDashaYears =
    DASHA_YEARS[
      firstLord
    ];

  if (
    firstDashaYears ===
    undefined
  ) {
    throw new Error(
      `Unknown dasha lord: ${firstLord}`,
    );
  }

  const firstRemainingYears =
    firstDashaYears *
    (
      1 -
      elapsedFraction
    );

  const sequence =
    getDashaSequenceFromLord(
      firstLord,
    );

  const mahadashas: Array<{
    lord: string;
    start: Date;
    end: Date;
    years: number;
  }> = [];

  let currentStart =
    new Date(
      birthDateUTC.getTime(),
    );

  for (
    let i = 0;
    i <
      sequence.length + 18;
    i += 1
  ) {
    const lord =
      sequence[
        i %
          sequence.length
      ];

    if (!lord) {
      break;
    }

    const fullYears =
      DASHA_YEARS[lord];

    if (
      fullYears ===
      undefined
    ) {
      throw new Error(
        `Unknown dasha lord: ${lord}`,
      );
    }

    const years =
      i === 0
        ? firstRemainingYears
        : fullYears;

    const end =
      addYears(
        currentStart,
        years,
      );

    mahadashas.push({
      lord,
      start:
        new Date(
          currentStart.getTime(),
        ),
      end:
        new Date(
          end.getTime(),
        ),
      years,
    });

    currentStart = end;

    if (
      currentStart >
      addYears(
        calculationDate,
        2,
      )
    ) {
      break;
    }
  }

  const currentMahadasha =
    mahadashas.find(
      (dasha) =>
        calculationDate >=
          dasha.start &&
        calculationDate <
          dasha.end,
    );

  if (!currentMahadasha) {
    return {
      moonNakshatra:
        nakshatra,

      mahadasha:
        null,

      antardasha:
        null,

      timeline:
        mahadashas.map(
          (dasha) => ({
            lord:
              dasha.lord,

            start:
              formatDate(
                dasha.start,
              ),

            end:
              formatDate(
                dasha.end,
              ),
          }),
        ),
    };
  }

  const antardashaSequence =
    getDashaSequenceFromLord(
      currentMahadasha.lord,
    );

  const mahadashaDurationMs =
    currentMahadasha.end.getTime() -
    currentMahadasha.start.getTime();

  let antardashaStart =
    new Date(
      currentMahadasha.start.getTime(),
    );

  let currentAntardasha:
    | {
        lord: string;
        start: Date;
        end: Date;
      }
    | null = null;

  for (
    const antardashaLord of
      antardashaSequence
  ) {
    const dashaYears =
      DASHA_YEARS[
        antardashaLord
      ];

    if (
      dashaYears ===
      undefined
    ) {
      continue;
    }

    const durationMs =
      mahadashaDurationMs *
      (
        dashaYears /
        120
      );

    const antardashaEnd =
      new Date(
        antardashaStart.getTime() +
          durationMs,
      );

    if (
      calculationDate >=
        antardashaStart &&
      calculationDate <
        antardashaEnd
    ) {
      currentAntardasha = {
        lord:
          antardashaLord,

        start:
          new Date(
            antardashaStart.getTime(),
          ),

        end:
          new Date(
            antardashaEnd.getTime(),
          ),
      };

      break;
    }

    antardashaStart =
      antardashaEnd;
  }

  const remainingYears =
    (
      currentMahadasha.end.getTime() -
      calculationDate.getTime()
    ) /
    (
      365.2425 *
      24 *
      60 *
      60 *
      1000
    );

  return {
    moonNakshatra:
      nakshatra,

    mahadasha: {
      lord:
        currentMahadasha.lord,

      start:
        formatDate(
          currentMahadasha.start,
        ),

      end:
        formatDate(
          currentMahadasha.end,
        ),

      remainingYears:
        Number(
          remainingYears.toFixed(
            3,
          ),
        ),
    },

    antardasha:
      currentAntardasha
        ? {
            lord:
              currentAntardasha.lord,

            start:
              formatDate(
                currentAntardasha.start,
              ),

            end:
              formatDate(
                currentAntardasha.end,
              ),
          }
        : null,

    timeline:
      mahadashas.map(
        (dasha) => ({
          lord:
            dasha.lord,

          start:
            formatDate(
              dasha.start,
            ),

          end:
            formatDate(
              dasha.end,
            ),
        }),
      ),
  };
}

/*
|--------------------------------------------------------------------------
| HOUSE CALCULATION
|--------------------------------------------------------------------------
*/

function findHouseForLongitude(
  longitude: number,
  cusps: ArrayLike<number>,
): number | null {
  const point =
    normalizeDegree(
      longitude,
    );

  for (
    let house = 1;
    house <= 12;
    house += 1
  ) {
    const startValue =
      cusps[house];

    const nextHouse =
      house === 12
        ? 1
        : house + 1;

    const endValue =
      cusps[nextHouse];

    if (
      typeof startValue !==
        "number" ||
      typeof endValue !==
        "number"
    ) {
      continue;
    }

    const start =
      normalizeDegree(
        startValue,
      );

    const end =
      normalizeDegree(
        endValue,
      );

    if (
      start <= end
    ) {
      if (
        point >= start &&
        point < end
      ) {
        return house;
      }
    } else if (
      point >= start ||
      point < end
    ) {
      return house;
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| SWISS EPHEMERIS
|--------------------------------------------------------------------------
*/

async function calculateSwissChart(
  profile: BirthProfile,
): Promise<SwissChart> {
  const location =
    profile.placeOfBirth;

  if (!location) {
    throw new Error(
      "Birth location is missing.",
    );
  }

  const {
    year,
    month,
    day,
    hour,
    minute,
  } =
    parseBirthDateTime(
      profile.dateOfBirth,
      profile.timeOfBirth,
    );

  /*
  |--------------------------------------------------------------------------
  | FIX:
  | Frontend can send "Europe/London", "Asia/Kolkata", etc.
  | Resolve that timezone to the correct offset for the actual
  | birth date/time, including DST.
  |--------------------------------------------------------------------------
  */

  const timezone =
    resolveTimezoneOffset(
      location.timezone,
      location.timezoneId,
      {
        year,
        month,
        day,
        hour,
        minute,
      },
    );

  const latitude =
    Number(
      location.latitude,
    );

  const longitude =
    Number(
      location.longitude,
    );

  if (
    !Number.isFinite(
      timezone,
    )
  ) {
    throw new Error(
      "Invalid birth timezone.",
    );
  }

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      "Invalid birth coordinates.",
    );
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      "Birth coordinates are out of range.",
    );
  }

  const localDecimalHour =
    hour +
    minute / 60;

  const utcDecimalHour =
    localDecimalHour -
    timezone;

  const swe =
    new SwissEph();

  try {
    await swe.initSwissEph();

    /*
    |--------------------------------------------------------------------------
    | LAHIRI SIDEREAL ZODIAC
    |--------------------------------------------------------------------------
    */

    swe.set_sid_mode(
      swe.SE_SIDM_LAHIRI,
      0,
      0,
    );

    /*
    |--------------------------------------------------------------------------
    | JULIAN DAY
    |--------------------------------------------------------------------------
    |
    | swisseph-wasm uses:
    |
    | julday(year, month, day, hour)
    |--------------------------------------------------------------------------
    */

    const julianDay =
      swe.julday(
        year,
        month,
        day,
        utcDecimalHour,
      );

    if (
      typeof julianDay !==
        "number" ||
      !Number.isFinite(
        julianDay,
      )
    ) {
      throw new Error(
        "Unable to calculate Julian Day.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PLANETS
    |--------------------------------------------------------------------------
    */

    const planetDefinitions = [
      {
        id: swe.SE_SUN,
        name: "Sun",
        symbol: "☉",
      },
      {
        id: swe.SE_MOON,
        name: "Moon",
        symbol: "☽",
      },
      {
        id: swe.SE_MERCURY,
        name: "Mercury",
        symbol: "☿",
      },
      {
        id: swe.SE_VENUS,
        name: "Venus",
        symbol: "♀",
      },
      {
        id: swe.SE_MARS,
        name: "Mars",
        symbol: "♂",
      },
      {
        id: swe.SE_JUPITER,
        name: "Jupiter",
        symbol: "♃",
      },
      {
        id: swe.SE_SATURN,
        name: "Saturn",
        symbol: "♄",
      },
      {
        id: swe.SE_URANUS,
        name: "Uranus",
        symbol: "♅",
      },
      {
        id: swe.SE_NEPTUNE,
        name: "Neptune",
        symbol: "♆",
      },
      {
        id: swe.SE_PLUTO,
        name: "Pluto",
        symbol: "♇",
      },
    ];

    const planets: Record<
      string,
      PlanetData
    > = {};

    const flags =
      swe.SEFLG_SWIEPH |
      swe.SEFLG_SPEED |
      swe.SEFLG_SIDEREAL;

    for (
      const planet of
        planetDefinitions
    ) {
      const position =
        swe.calc_ut(
          julianDay,
          planet.id,
          flags,
        );

      const rawLongitude =
        position[0];

      const rawLatitude =
        position[1];

      const rawDistance =
        position[2];

      const rawSpeed =
        position[3];

      if (
        typeof rawLongitude !==
          "number" ||
        !Number.isFinite(
          rawLongitude,
        )
      ) {
        throw new Error(
          `Invalid longitude returned for ${planet.name}.`,
        );
      }

      const normalizedLongitude =
        normalizeDegree(
          rawLongitude,
        );

      planets[
        planet.name
      ] = {
        name:
          planet.name,

        symbol:
          planet.symbol,

        longitude:
          Number(
            normalizedLongitude.toFixed(
              6,
            ),
          ),

        latitude:
          typeof rawLatitude ===
              "number" &&
          Number.isFinite(
            rawLatitude,
          )
            ? Number(
                rawLatitude.toFixed(
                  6,
                ),
              )
            : undefined,

        distance:
          typeof rawDistance ===
              "number" &&
          Number.isFinite(
            rawDistance,
          )
            ? Number(
                rawDistance.toFixed(
                  8,
                ),
              )
            : undefined,

        speed:
          typeof rawSpeed ===
              "number" &&
          Number.isFinite(
            rawSpeed,
          )
            ? Number(
                rawSpeed.toFixed(
                  6,
                ),
              )
            : undefined,

        zodiac:
          zodiacFromLongitude(
            normalizedLongitude,
          ),

        nakshatra:
          getNakshatra(
            normalizedLongitude,
          ),
      };
    }

    /*
    |--------------------------------------------------------------------------
    | RAHU / KETU
    |--------------------------------------------------------------------------
    */

    const nodeFlags =
      swe.SEFLG_SWIEPH |
      swe.SEFLG_SIDEREAL;

    const rahuPosition =
      swe.calc_ut(
        julianDay,
        swe.SE_TRUE_NODE,
        nodeFlags,
      );

    const rahuRawLongitude =
      rahuPosition[0];

    if (
      typeof rahuRawLongitude !==
        "number" ||
      !Number.isFinite(
        rahuRawLongitude,
      )
    ) {
      throw new Error(
        "Invalid Rahu longitude.",
      );
    }

    const rahuLongitude =
      normalizeDegree(
        rahuRawLongitude,
      );

    const ketuLongitude =
      normalizeDegree(
        rahuLongitude +
          180,
      );

    planets.Rahu = {
      name: "Rahu",
      symbol: "☊",

      longitude:
        Number(
          rahuLongitude.toFixed(
            6,
          ),
        ),

      zodiac:
        zodiacFromLongitude(
          rahuLongitude,
        ),

      nakshatra:
        getNakshatra(
          rahuLongitude,
        ),
    };

    planets.Ketu = {
      name: "Ketu",
      symbol: "☋",

      longitude:
        Number(
          ketuLongitude.toFixed(
            6,
          ),
        ),

      zodiac:
        zodiacFromLongitude(
          ketuLongitude,
        ),

      nakshatra:
        getNakshatra(
          ketuLongitude,
        ),
    };

    /*
    |--------------------------------------------------------------------------
    | HOUSES
    |--------------------------------------------------------------------------
    */

    const houseResult =
      swe.houses_ex(
        julianDay,
        swe.SEFLG_SIDEREAL,
        latitude,
        longitude,
        "P",
      );

    const cusps =
      houseResult.cusps;

    const ascmc =
      houseResult.ascmc;

    const ascendantValue =
      ascmc[0];

    const midheavenValue =
      ascmc[1];

    if (
      typeof ascendantValue !==
        "number" ||
      !Number.isFinite(
        ascendantValue,
      )
    ) {
      throw new Error(
        "Unable to calculate ascendant.",
      );
    }

    if (
      typeof midheavenValue !==
        "number" ||
      !Number.isFinite(
        midheavenValue,
      )
    ) {
      throw new Error(
        "Unable to calculate midheaven.",
      );
    }

    const ascendant =
      normalizeDegree(
        ascendantValue,
      );

    const midheaven =
      normalizeDegree(
        midheavenValue,
      );

    const houses: HouseData[] =
      [];

    for (
      let house = 1;
      house <= 12;
      house += 1
    ) {
      const cuspValue =
        cusps[house];

      if (
        typeof cuspValue !==
          "number" ||
        !Number.isFinite(
          cuspValue,
        )
      ) {
        throw new Error(
          `Unable to calculate house ${house}.`,
        );
      }

      const cusp =
        normalizeDegree(
          cuspValue,
        );

      houses.push({
        house,

        longitude:
          Number(
            cusp.toFixed(
              6,
            ),
          ),

        zodiac:
          zodiacFromLongitude(
            cusp,
          ),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PLANET -> HOUSE
    |--------------------------------------------------------------------------
    */

    Object.values(
      planets,
    ).forEach(
      (planet) => {
        planet.house =
          findHouseForLongitude(
            planet.longitude,
            cusps,
          );
      },
    );

    /*
    |--------------------------------------------------------------------------
    | UTC BIRTH TIME
    |--------------------------------------------------------------------------
    */

    const utcMillis =
      Date.UTC(
        year,
        month - 1,
        day,
        0,
        0,
        0,
        0,
      ) +
      utcDecimalHour *
        60 *
        60 *
        1000;

    const birthDateUTC =
      new Date(
        utcMillis,
      );

    if (
      Number.isNaN(
        birthDateUTC.getTime(),
      )
    ) {
      throw new Error(
        "Unable to calculate UTC birth time.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | DASHA
    |--------------------------------------------------------------------------
    */

    const moon =
      planets.Moon;

    if (!moon) {
      throw new Error(
        "Moon position was not calculated.",
      );
    }

    const dasha =
      getVimshottariDasha(
        birthDateUTC,
        moon.longitude,
      );

    /*
    |--------------------------------------------------------------------------
    | AYANAMSHA
    |--------------------------------------------------------------------------
    */

    const ayanamsa =
      swe.get_ayanamsa_ut(
        julianDay,
      );

    const resolvedTimezoneId =
      location.timezoneId ??
      (
        typeof location.timezone ===
          "string" &&
        location.timezone.includes(
          "/",
        )
          ? location.timezone
          : null
      );

    return {
      calculation: {
        julianDay:
          Number(
            julianDay.toFixed(
              8,
            ),
          ),

        utcBirthTime:
          birthDateUTC.toISOString(),

        /*
        |--------------------------------------------------------------------------
        | This is now always the numeric UTC offset actually used by
        | Swiss Ephemeris.
        |--------------------------------------------------------------------------
        */

        timezone,

        timezoneId:
          resolvedTimezoneId,

        latitude,

        longitude,

        houseSystem:
          "Placidus",

        zodiac:
          "Sidereal",

        ayanamsa:
          "Lahiri",

        ayanamsaValue:
          typeof ayanamsa ===
              "number" &&
          Number.isFinite(
            ayanamsa,
          )
            ? Number(
                ayanamsa.toFixed(
                  8,
                ),
              )
            : null,

        swissEphemeris:
          "swisseph-wasm",
      },

      ascendant: {
        longitude:
          Number(
            ascendant.toFixed(
              6,
            ),
          ),

        zodiac:
          zodiacFromLongitude(
            ascendant,
          ),
      },

      midheaven: {
        longitude:
          Number(
            midheaven.toFixed(
              6,
            ),
          ),

        zodiac:
          zodiacFromLongitude(
            midheaven,
          ),
      },

      planets,

      houses,

      dasha,
    };
  } finally {
    swe.close();
  }
}

/*
|--------------------------------------------------------------------------
| GEMINI RESPONSE PARSER
|--------------------------------------------------------------------------
*/

function parseGeminiResponse(
  value: unknown,
): GeminiResponse {
  if (!isRecord(value)) {
    return {};
  }

  const candidates =
    value.candidates;

  if (!Array.isArray(candidates)) {
    return {};
  }

  const parsedCandidates:
    GeminiCandidate[] =
    [];

  for (
    const candidate of
      candidates
  ) {
    if (!isRecord(candidate)) {
      continue;
    }

    const contentValue =
      candidate.content;

    if (
      !isRecord(
        contentValue,
      )
    ) {
      parsedCandidates.push({});
      continue;
    }

    const partsValue =
      contentValue.parts;

    if (
      !Array.isArray(partsValue)
    ) {
      parsedCandidates.push({
        content: {},
      });

      continue;
    }

    const parts:
      GeminiPart[] = [];

    for (
      const part of partsValue
    ) {
      if (!isRecord(part)) {
        continue;
      }

      parts.push({
        text:
          getString(
            part.text,
          ),
      });
    }

    parsedCandidates.push({
      content: {
        parts,
      },
    });
  }

  return {
    candidates:
      parsedCandidates,
  };
}

/*
|--------------------------------------------------------------------------
| GEMINI
|--------------------------------------------------------------------------
*/

async function askGemini(
  astrologyContext: string,
  messages: ChatMessage[],
): Promise<string> {
  const apiKeys =
    getGeminiApiKeys();

  if (
    apiKeys.length === 0
  ) {
    throw new Error(
      "No Gemini API keys are configured.",
    );
  }

  const contents =
    messages
      .filter(
        (message) =>
          message.content
            .trim()
            .length > 0,
      )
      .map(
        (message) => ({
          role:
            message.role ===
            "assistant"
              ? "model"
              : "user",

          parts: [
            {
              text:
                message.content
                  .trim(),
            },
          ],
        }),
      );

  if (
    contents.length === 0
  ) {
    throw new Error(
      "No valid chat messages were provided.",
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  let lastError =
    "Unknown Gemini error.";

  for (
    let keyIndex = 0;
    keyIndex <
      apiKeys.length;
    keyIndex += 1
  ) {
    const apiKey =
      apiKeys[keyIndex];

    if (!apiKey) {
      continue;
    }

    let response:
      | Response
      | null = null;

    let responseText =
      "";

    for (
      let attempt = 0;
      attempt <=
        MAX_GEMINI_RETRIES;
      attempt += 1
    ) {
      try {
        response =
          await fetch(
            url,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-goog-api-key":
                  apiKey,
              },

              body:
                JSON.stringify({
                  systemInstruction: {
                    parts: [
                      {
                        text:
                          astrologyContext,
                      },
                    ],
                  },

                  contents,

                  generationConfig: {
                    maxOutputTokens:
                      1600,
                  },
                }),
            },
          );

        responseText =
          await response.text();

        if (response.ok) {
          break;
        }

        if (
          response.status === 429
        ) {
          lastError =
            "Gemini API usage limit or quota exceeded.";

          break;
        }

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          lastError =
            responseText;

          break;
        }

        const retryable =
          response.status === 408 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        if (
          retryable &&
          attempt <
            MAX_GEMINI_RETRIES
        ) {
          const delay =
            INITIAL_RETRY_DELAY *
              2 ** attempt +
            Math.floor(
              Math.random() * 500,
            );

          await sleep(delay);

          continue;
        }

        lastError =
          responseText;

        break;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : "Network error.";

        if (
          attempt >=
          MAX_GEMINI_RETRIES
        ) {
          break;
        }

        const delay =
          INITIAL_RETRY_DELAY *
            2 ** attempt +
          Math.floor(
            Math.random() * 500,
          );

        await sleep(delay);
      }
    }

    if (response?.ok) {
      let parsed:
        GeminiResponse;

      try {
        const json:
          unknown =
          JSON.parse(
            responseText,
          );

        parsed =
          parseGeminiResponse(
            json,
          );
      } catch {
        lastError =
          "Gemini returned invalid JSON.";

        continue;
      }

      const parts =
        parsed
          .candidates?.[0]
          ?.content?.parts;

      const text =
        Array.isArray(parts)
          ? parts
              .map(
                (part) =>
                  part.text ?? "",
              )
              .join("")
              .trim()
          : "";

      if (!text) {
        lastError =
          "Gemini returned an empty response.";

        continue;
      }

      return text;
    }
  }

  throw new Error(
    `All Gemini API keys failed. ${lastError}`,
  );
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
): string {
  const location =
    profile.placeOfBirth;

  if (!location) {
    throw new Error(
      "Birth location is missing.",
    );
  }

  const planets =
    Object.entries(
      chart.planets,
    )
      .map(
        ([name, planet]) =>
          `${name}: ${planet.zodiac.formatted} | Longitude: ${planet.longitude}° | House: ${
            planet.house ??
            "Unknown"
          } | Nakshatra: ${planet.nakshatra.formatted}`,
      )
      .join("\n");

  const houses =
    chart.houses
      .map(
        (house) =>
          `House ${house.house}: ${house.zodiac.formatted}`,
      )
      .join("\n");

  const languageInstruction =
    language === "hi"
      ? `
LANGUAGE REQUIREMENT:

The user selected Hindi.

Respond entirely in Hindi (हिन्दी).

Use natural, clear and conversational Hindi.

You may keep standard astrology terminology such as
Nakshatra, Mahadasha, Antardasha, Ascendant, planets,
Rashi and house names where this makes the answer clearer.

Do NOT answer in English unless the user specifically
asks for English.

The final answer must be in Hindi.
`
      : `
LANGUAGE REQUIREMENT:

The user selected English.

Respond entirely in English.

Use clear, natural and conversational English.

Do NOT answer in Hindi unless the user specifically
asks for Hindi.

The final answer must be in English.
`;

  return `
You are AstroAI, a Vedic astrology interpretation assistant.

${languageInstruction}

IMPORTANT:

Swiss Ephemeris has already calculated the chart data
below.

You MUST use the supplied chart data.

Do NOT recalculate planetary positions.

Do NOT invent planetary degrees.

Do NOT invent houses.

Do NOT invent Nakshatras.

Do NOT invent Dasha periods.

Your job is to interpret the supplied chart.

--------------------------------------------------
BIRTH PROFILE
--------------------------------------------------

Name:
${profile.name}

Gender:
${profile.gender || "Not specified"}

Date of Birth:
${profile.dateOfBirth}

Time of Birth:
${profile.timeOfBirth}

Birth Place:
${location.name}

Full Birth Place:
${location.displayName}

Latitude:
${location.latitude}

Longitude:
${location.longitude}

Timezone:
${chart.calculation.timezoneId || "Unknown"}

UTC Offset:
UTC${
    chart.calculation.timezone >=
    0
      ? "+"
      : ""
  }${chart.calculation.timezone}

--------------------------------------------------
SWISS EPHEMERIS
--------------------------------------------------

Julian Day:
${chart.calculation.julianDay}

UTC Birth Time:
${chart.calculation.utcBirthTime}

Zodiac:
${chart.calculation.zodiac}

Ayanamsha:
${chart.calculation.ayanamsa}

Ayanamsha Value:
${chart.calculation.ayanamsaValue}

House System:
${chart.calculation.houseSystem}

--------------------------------------------------
ASCENDANT
--------------------------------------------------

Ascendant:
${chart.ascendant.zodiac.formatted}

Ascendant Longitude:
${chart.ascendant.longitude}°

Midheaven:
${chart.midheaven.zodiac.formatted}

Midheaven Longitude:
${chart.midheaven.longitude}°

--------------------------------------------------
PLANETARY POSITIONS
--------------------------------------------------

${planets}

--------------------------------------------------
HOUSES
--------------------------------------------------

${houses}

--------------------------------------------------
MOON NAKSHATRA
--------------------------------------------------

Nakshatra:
${chart.dasha.moonNakshatra.name}

Nakshatra Lord:
${chart.dasha.moonNakshatra.lord}

Pada:
${chart.dasha.moonNakshatra.pada}

--------------------------------------------------
VIMSHOTTARI DASHA
--------------------------------------------------

Current Mahadasha:
${chart.dasha.mahadasha?.lord ?? "Not available"}

Mahadasha Start:
${chart.dasha.mahadasha?.start ?? "Not available"}

Mahadasha End:
${chart.dasha.mahadasha?.end ?? "Not available"}

Current Antardasha:
${chart.dasha.antardasha?.lord ?? "Not available"}

Antardasha Start:
${chart.dasha.antardasha?.start ?? "Not available"}

Antardasha End:
${chart.dasha.antardasha?.end ?? "Not available"}

--------------------------------------------------
INTERPRETATION RULES
--------------------------------------------------

  1. Use the actual calculated chart.

  2. Interpret the chart rather than inventing calculations.

  3. For career questions, consider relevant houses,
    planets, house placements and supplied dasha periods.

  4. For relationship questions, consider relevant houses,
    Venus, Mars, Jupiter, Moon and supplied dasha information.

  5. For timing questions, use the supplied Mahadasha
    and Antardasha dates.

  6. If information needed for a requested technique is
    not supplied, say so clearly.

  7. Do not describe astrology as guaranteed fact.

  8. Keep answers conversational and useful.

  9. Do not mention API keys or backend implementation.

  10. ALWAYS follow the selected language.

  11. Do not switch languages unless the user explicitly
      asks to change language.

  12. If the user asks a follow-up question, continue in
      the selected language.
  13. AstroAI is designed for Vedic astrology questions only.
    Answer questions related to the user's own birth chart,
    including career, job, business, money, education,
    marriage, relationships, family, health-related
    astrological tendencies, travel, property, spirituality,
    life patterns, timing, Dashas, and future-oriented
    astrology questions.

    Do not provide unrelated information such as weather,
    news, sports, stock prices, cryptocurrency prices,
    coding help, or general non-astrology information.

    If the user asks an unrelated question, politely explain
    that AstroAI is designed for Vedic astrology and ask them
    to ask a question related to their birth chart or
    astrology.

  14. AstroAI currently supports only one birth profile.
    Do not calculate or interpret a second person's birth
    chart from birth details provided inside the prompt.
    For two-person kundli matching or compatibility,
    explain that only one birth profile is currently supported.

  15. RESPONSE LENGTH AND COMPLETENESS:
    Keep responses concise but complete.
    For normal questions, give a clear answer with
    approximately 3 to 7 meaningful points.
    Do not unnecessarily repeat the same information.
    Always finish the explanation before ending the response.
    Include a short final summary when the question requires
    explanation or analysis.
    Do not start unnecessary sections or long introductions.
    For simple questions, keep the answer brief.
    For detailed questions, use the available response space
    efficiently and complete the main points before concluding.
    Never leave the answer incomplete or cut off.
`;
}

/*
|--------------------------------------------------------------------------
| POST /api/chat
|--------------------------------------------------------------------------
*/

export async function POST(
  req: NextRequest,
) {
  try {
    const body: unknown =
      await req.json();

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PROFILE
    |--------------------------------------------------------------------------
    */

    const profileValue =
      body.profile;

    if (
      !isBirthProfile(
        profileValue,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid birth profile.",
        },
        {
          status: 400,
        },
      );
    }

    const profile =
      profileValue;

    /*
    |--------------------------------------------------------------------------
    | LANGUAGE
    |--------------------------------------------------------------------------
    */

    const languageValue =
      body.language;

    const language:
      ResponseLanguage =
      isResponseLanguage(
        languageValue,
      )
        ? languageValue
        : "en";

    /*
    |--------------------------------------------------------------------------
    | MESSAGES
    |--------------------------------------------------------------------------
    */

    const messages =
      parseChatMessages(
        body.messages,
      );

    if (!messages) {
      return NextResponse.json(
        {
          error:
            "Invalid chat messages.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      messages.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid chat message provided.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      messages.length >
      MAX_MESSAGES
    ) {
      return NextResponse.json(
        {
          error:
            "Conversation is too long.",
        },
        {
          status: 400,
        },
      );
    }

    const oversizedMessage =
      messages.find(
        (message) =>
          message.content.length >
          MAX_MESSAGE_LENGTH,
      );

    if (oversizedMessage) {
      return NextResponse.json(
        {
          error:
            "Message is too long.",
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | PROFILE VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
      !profile.name.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Name is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !profile.dateOfBirth.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Date of birth is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !profile.timeOfBirth.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Time of birth is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !profile.placeOfBirth
    ) {
      return NextResponse.json(
        {
          error:
            "Please select a birth location.",
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GET LATEST USER QUESTION
    |--------------------------------------------------------------------------
    */

    const latestUserMessage =
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role ===
              "user" &&
            message.content
              .trim()
              .length > 0,
        );

    const question =
      latestUserMessage?.content.trim();

    if (!question) {
      return NextResponse.json(
        {
          error:
            "Question is required.",
        },
        {
          status: 400,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | GEMINI KEY CHECK
    |--------------------------------------------------------------------------
    */

    if (
      getGeminiApiKeys()
        .length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No Gemini API keys are configured.",
        },
        {
          status: 500,
        },
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CALCULATE CHART
    |--------------------------------------------------------------------------
    */

    const chart =
      await calculateSwissChart(
        profile,
      );

    /*
    |--------------------------------------------------------------------------
    | BUILD AI CONTEXT
    |--------------------------------------------------------------------------
    */

    const astrologyContext =
      buildAstrologyContext(
        profile,
        chart,
        language,
      );

    /*
    |--------------------------------------------------------------------------
    | ASK GEMINI
    |--------------------------------------------------------------------------
    */

    const answer =
      await askGemini(
        astrologyContext,
        messages,
      );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      message: answer,
      language,
      chart,
    });
  } catch (error) {
    console.error(
      "AstroAI API error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unknown server error.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}