import { NextRequest, NextResponse } from "next/server";

import { ASTROLOGY_SYSTEM_RULES } from "../../../lib/astrology-rules";
import { callGroq } from "../../../lib/groq";
import { sendAstroEmail } from "../../../lib/sendAstroEmail";
import {
  getConversationMemory,
  setConversationMemory,
} from "../../../lib/conversation-cache";
import {
  calculateSwissChart,
  serializeChartForAI,
  type BirthProfile,
  type SwissChart,
} from "../../../lib/vedic-chart";

export const runtime = "nodejs";

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type ResponseLanguage = "en" | "hi";

type ThinkingLevel = "low" | "medium" | "high";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationMemory = {
  summary: string;
  summaryMessageCount: number;
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
| GEMINI KEY HEALTH
|--------------------------------------------------------------------------
*/

type GeminiKeyHealth = {
  failedUntil: number;
  failureCount: number;
  lastError?: string;
};

type RedisResponse<T = unknown> = {
  result?: T;
  error?: string;
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

const GEMINI_TIMEOUT_MS = 45_000;

const MAX_MESSAGES = 100;

const MAX_MESSAGE_LENGTH = 6000;

/*
|--------------------------------------------------------------------------
| 12-HOUR GEMINI KEY COOLDOWN
|--------------------------------------------------------------------------
*/

const GEMINI_KEY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const GEMINI_HEALTH_PREFIX = "gemini:key-health:";

/*
 * Local fallback.
 *
 * Redis should be configured in production because the local Map
 * is only shared inside the current server instance.
 */
const localGeminiHealth = new Map<string, GeminiKeyHealth>();

/*
|--------------------------------------------------------------------------
| REDIS HELPERS
|--------------------------------------------------------------------------
*/

async function redisCommand<T = unknown>(
  command: string[],
): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();

  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  /*
   * Redis is optional at code level.
   *
   * If it is not configured, the local Map will be used.
   */
  if (!url || !token) {
    return null;
  }

  try {
    const response = await fetch(url, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },

      cache: "no-store",

      body: JSON.stringify(command),
    });

    if (!response.ok) {
      console.error(
        `[Gemini Health] Redis request failed: ${response.status}`,
      );

      return null;
    }

    const data = (await response.json()) as RedisResponse<T>;

    if (data.error) {
      console.error("[Gemini Health] Redis error:", data.error);

      return null;
    }

    return data.result ?? null;
  } catch (error) {
    console.error(
      "[Gemini Health] Redis connection failed:",
      getErrorMessage(error),
    );

    return null;
  }
}

function getGeminiHealthKey(keyName: string): string {
  return `${GEMINI_HEALTH_PREFIX}${keyName}`;
}

async function getGeminiKeyHealth(
  keyName: string,
): Promise<GeminiKeyHealth | null> {
  const redisKey = getGeminiHealthKey(keyName);

  const redisValue = await redisCommand<string>([
    "GET",
    redisKey,
  ]);

  if (redisValue) {
    try {
      const parsed = JSON.parse(redisValue) as GeminiKeyHealth;

      if (
        typeof parsed.failedUntil === "number" &&
        typeof parsed.failureCount === "number"
      ) {
        /*
         * Cooldown still active.
         */
        if (parsed.failedUntil > Date.now()) {
          return parsed;
        }

        /*
         * Cooldown expired.
         */
        await clearGeminiKeyHealth(keyName);

        return null;
      }
    } catch {
      console.warn(
        `[Gemini Health] Invalid Redis data for ${keyName}`,
      );
    }
  }

  /*
   * Local fallback.
   */
  const localValue = localGeminiHealth.get(keyName);

  if (!localValue) {
    return null;
  }

  if (localValue.failedUntil <= Date.now()) {
    localGeminiHealth.delete(keyName);

    return null;
  }

  return localValue;
}

async function setGeminiKeyHealth(
  keyName: string,
  previous: GeminiKeyHealth | null,
  errorMessage: string,
): Promise<void> {
  const failedUntil = Date.now() + GEMINI_KEY_COOLDOWN_MS;

  const health: GeminiKeyHealth = {
    failedUntil,

    failureCount: (previous?.failureCount ?? 0) + 1,

    lastError: clampString(errorMessage, 500),
  };

  /*
   * Always update local state.
   */
  localGeminiHealth.set(keyName, health);

  /*
   * Persist globally in Redis.
   */
  const redisKey = getGeminiHealthKey(keyName);

  const ttlSeconds = Math.ceil(
    GEMINI_KEY_COOLDOWN_MS / 1000,
  );

  await redisCommand([
    "SET",

    redisKey,

    JSON.stringify(health),

    "EX",

    String(ttlSeconds),
  ]);
}

async function clearGeminiKeyHealth(
  keyName: string,
): Promise<void> {
  localGeminiHealth.delete(keyName);

  await redisCommand([
    "DEL",

    getGeminiHealthKey(keyName),
  ]);
}

/*
|--------------------------------------------------------------------------
| GENERAL HELPERS
|--------------------------------------------------------------------------
*/

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
| GEMINI COOLDOWN DECISION
|--------------------------------------------------------------------------
*/

function shouldCooldownGeminiKey(error: unknown): boolean {
  const status = getErrorStatus(error);

  const message = getErrorMessage(error).toLowerCase();

  /*
   * Temporary/provider-side failures.
   */
  if (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }

  /*
   * Network/timeout failures generally have status 0.
   */
  if (status === 0) {
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("network") ||
      message.includes("fetch failed") ||
      message.includes("socket") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("abort") ||
      message.includes("aborted")
    );
  }

  return false;
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
astrological facts (sidereal Lahiri zodiac,
whole-sign houses, Vimshottari Dasha).

Do not recalculate the chart from
the birth details.

Do not invent missing planetary
positions, houses, Dashas, Nakshatras,
yogas or aspects. Use only the planets,
houses, house lords, dignities, aspects
and Dasha periods supplied in the chart.

Use the supplied chart as the source
of astrological facts.

The goal is NOT to list everything
in the chart.

Select the factors relevant to the
user's question and explain how they
connect.

Be specific and personalized.

Avoid generic horoscope language
when chart-specific information is available.
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
- Never predict death, serious illness or
  exact event dates.
- Do not give medical, legal or financial
  instructions.
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
| GEMINI KEY NAMES
|--------------------------------------------------------------------------
|
| We store only the environment-variable name in Redis.
| The actual Gemini API key is NEVER stored in Redis.
|--------------------------------------------------------------------------
*/

function getGeminiApiKeyEntries(): Array<{
  name: string;
  value: string;
}> {
  const entries = [
    {
      name: "GEMINI_API_KEY",
      value: process.env.GEMINI_API_KEY,
    },

    {
      name: "GEMINI_API_KEY1",
      value: process.env.GEMINI_API_KEY1,
    },

    {
      name: "GEMINI_API_KEY2",
      value: process.env.GEMINI_API_KEY2,
    },

    {
      name: "GEMINI_API_KEY3",
      value: process.env.GEMINI_API_KEY3,
    },

    {
      name: "GEMINI_API_KEY4",
      value: process.env.GEMINI_API_KEY4,
    },

    {
      name: "GEMINI_API_KEY5",
      value: process.env.GEMINI_API_KEY5,
    },
  ];

  const seen = new Set<string>();

  return entries.filter((entry) => {
    const value = entry.value?.trim();

    if (!value) {
      return false;
    }

    /*
     * Keep the same deduplication behavior as the original
     * getGeminiApiKeys() function.
     */
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);

    return true;
  }).map((entry) => ({
    name: entry.name,
    value: entry.value!.trim(),
  }));
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
| GEMINI FULL FALLBACK + 12-HOUR KEY COOLDOWN
|--------------------------------------------------------------------------
|
| Model order:
|
| Primary model
|   -> available Gemini keys
|
| Fallback model 1
|   -> available Gemini keys
|
| Fallback model 2
|   -> available Gemini keys
|
| A key that receives a temporary/provider failure is
| globally disabled for 12 hours.
|
| After Gemini is completely exhausted:
|   -> Groq
|--------------------------------------------------------------------------
*/

async function requestGeminiWithKeyRotation(
  systemPrompt: string,
  question: string,
): Promise<{
  payload: AstroAnswerPayload;
  model: string;
}> {
  /*
   * Use the named entries here so we know which
   * Redis health record belongs to each key.
   */
  const apiKeyEntries = getGeminiApiKeyEntries();

  if (apiKeyEntries.length === 0) {
    throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
  }

  /*
   * Determine which keys are currently healthy.
   *
   * This happens once per request so a key that is
   * globally cooling down is skipped completely.
   */
  const usableKeys: Array<{
    name: string;
    value: string;
  }> = [];

  for (const entry of apiKeyEntries) {
    const health = await getGeminiKeyHealth(entry.name);

    if (health && health.failedUntil > Date.now()) {
      const remainingMinutes = Math.ceil(
        (health.failedUntil - Date.now()) / 60_000,
      );

      console.warn(
        `[Gemini] Skipping ${entry.name}; cooldown active for approximately ${remainingMinutes} minutes.`,
      );

      continue;
    }

    usableKeys.push(entry);
  }

  /*
   * Every configured key is currently cooling down.
   *
   * Throw immediately so the caller moves to Groq.
   */
  if (usableKeys.length === 0) {
    throw new Error("GEMINI_ALL_KEYS_COOLDOWN");
  }

  let lastError: unknown = null;

  /*
   * IMPORTANT:
   *
   * usableKeys is mutated when a key receives a
   * cooldown-worthy failure.
   *
   * Therefore that key will NOT be tried against
   * another Gemini model during this request.
   */
  for (const model of GEMINI_MODEL_CHAIN) {
    console.log(`[Gemini] Trying model: ${model}`);

    /*
     * Snapshot the current usable keys.
     */
    const keysForModel = [...usableKeys];

    for (const entry of keysForModel) {
      /*
       * The key may have been removed while another
       * model/key combination was processing.
       */
      if (
        !usableKeys.some(
          (usableKey) => usableKey.name === entry.name,
        )
      ) {
        continue;
      }

      try {
        const response = await requestGemini(
          entry.value,
          model,
          systemPrompt,
          question,
        );

        const text = extractGeminiText(response);

        if (!text) {
          throw new Error("GEMINI_EMPTY_RESPONSE");
        }

        const payload = parseAstroAnswerPayload(text);

        /*
         * SUCCESS
         *
         * Clear any old health record for this key.
         */
        await clearGeminiKeyHealth(entry.name);

        console.log(
          `[Gemini] Success: ${model} using ${entry.name}`,
        );

        return {
          payload,
          model,
        };
      } catch (error) {
        lastError = error;

        const info = getGeminiErrorInfo(error);

        console.warn(
          `[Gemini] Failed model=${model}, key=${entry.name}, status=${info.status}: ${info.message}`,
        );

        /*
         * Only temporary/provider/network failures
         * cause the 12-hour global cooldown.
         */
        if (shouldCooldownGeminiKey(error)) {
          const previousHealth = await getGeminiKeyHealth(
            entry.name,
          );

          await setGeminiKeyHealth(
            entry.name,
            previousHealth,
            info.message,
          );

          /*
           * Do not use this key against another model
           * during the current request.
           */
          const index = usableKeys.findIndex(
            (usableKey) => usableKey.name === entry.name,
          );

          if (index !== -1) {
            usableKeys.splice(index, 1);
          }

          console.warn(
            `[Gemini] ${entry.name} placed on 12-hour cooldown.`,
          );
        }

        /*
         * For non-cooldown errors, simply continue.
         *
         * Example:
         * 400 / 401 / 403
         *
         * These do NOT globally disable the key.
         */
        continue;
      }
    }

    /*
     * If every key has now been placed on cooldown,
     * stop trying Gemini models.
     */
    if (usableKeys.length === 0) {
      console.warn(
        "[Gemini] All Gemini keys are now on cooldown.",
      );

      break;
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