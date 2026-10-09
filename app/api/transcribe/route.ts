import { NextResponse } from "next/server";

import { collectKeys, rotateKeys } from "../../../lib/api-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ====================== TYPES ====================== */

type Pass = "auto" | "hi";
type Source = "groq" | "gemini";
type Confidence = "high" | "check";

type WhisperSegment = {
  text?: string;
  start?: number;
  end?: number;
  no_speech_prob?: number;
  avg_logprob?: number;
};

type WhisperResponse = {
  text?: string;
  language?: string;
  segments?: WhisperSegment[];
  error?: { message?: string };
};

type GroqCandidate = {
  pass: Pass;
  text: string;
  language: string;
  score: number;
  silent: boolean;
};

type TranscriptResult = {
  text: string;
  source: Source;
  confidence: Confidence;
  language: string;
  alternatives: string[];
};

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  error?: unknown;
};

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* ====================== CONFIG ====================== */

const MAX_AUDIO_SIZE = 8 * 1024 * 1024;
const MIN_AUDIO_SIZE = 1024;

const TOTAL_BUDGET_MS = 50_000;
const GROQ_BUDGET_MS = 22_000;
const GROQ_TIMEOUT_MS = 12_000;
const GEMINI_TIMEOUT_MS = 15_000;

// avg_logprob scores (higher = more confident)
const SECOND_PASS_BELOW = -0.45; // Groq ka Hindi pass
const GEMINI_VERIFY_BELOW = -0.7; // Gemini se dobara check

// Model-wide problem (503 / timeout) ke itne baar ke baad agla model
const MAX_OVERLOADS_PER_MODEL = 2;

const GROQ_MODELS = [
  ...new Set([
    process.env.GROQ_TRANSCRIPTION_MODEL?.trim() || "whisper-large-v3",
    "whisper-large-v3-turbo",
  ]),
];

const GEMINI_MODELS = [
  ...new Set(
    [
      process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
      process.env.GEMINI_FALLBACK_MODEL_1?.trim() || "gemini-3.7-flash",
      process.env.GEMINI_FALLBACK_MODEL_2?.trim() || "gemini-3.6-flash",
    ].filter(Boolean),
  ),
];

/* ====================== KEYS ====================== */

// GEMINI_API_KEY, GEMINI_API_KEY1 ... GEMINI_API_KEY100 (+ GEMINI_API_KEYS=a,b,c)
const getGeminiKeys = () => collectKeys("GEMINI_API_KEY");
const getGroqKeys = () => collectKeys("GROQ_API_KEY");

/* ====================== HELPERS ====================== */

function getExtension(mime: string): string {
  const type = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
  };
  return map[type] || "webm";
}

function normalizeAudio(audio: File): File {
  const type = (audio.type || "audio/webm").split(";")[0].trim();
  return new File([audio], `voice.${getExtension(audio.type)}`, { type });
}

function parseHints(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length < 60)
    .slice(0, 15);
}

// Whisper prompt = vocabulary + number style (naam, jagah, astrology words, digits ka example)
function buildVocabularyPrompt(hints: string[]): string {
  const numberStyle =
    "मेरा नंबर 9876543210 है, जन्म 14 June 1985 को, सुबह 5:30 बजे, उम्र 38 साल.";
  const base = [
    "कुंडली", "राशि", "लग्न", "दशा", "महादशा", "अंतर्दशा", "नक्षत्र",
    "kundli", "Mahadasha", "Antardasha", "Nakshatra", "career",
    "marriage", "business", "job", "health", "love",
  ];
  return [...hints, numberStyle, ...base].filter(Boolean).join(", ").slice(0, 600);
}

function isKnownLanguage(language: string): boolean {
  const l = language.toLowerCase();
  return l === "hindi" || l === "english" || l === "hi" || l === "en";
}

/* ---------- Number normalization (words / Devanagari digits -> 0-9) ---------- */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  शून्य: "0", एक: "1", दो: "2", तीन: "3", चार: "4",
  पांच: "5", पाँच: "5", छह: "6", छः: "6", सात: "7", आठ: "8", नौ: "9",
};

const DIGIT_WORD_PATTERN = `(?:${Object.keys(DIGIT_WORDS).join("|")})`;

// 4 ya zyada digit-words ek saath (phone number jaisa), normal sentence safe rahe
const DIGIT_RUN = new RegExp(
  `(?<![\\p{L}\\p{M}])${DIGIT_WORD_PATTERN}(?:[\\s,.-]+${DIGIT_WORD_PATTERN}){3,}(?![\\p{L}\\p{M}])`,
  "giu",
);

function normalizeNumbers(text: string): string {
  if (!text) return text;
  return text
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(DIGIT_RUN, (run) =>
      run
        .split(/[\s,.-]+/)
        .map((w) => DIGIT_WORDS[w.toLowerCase()] ?? w)
        .join(""),
    );
}

/* ---------- Network helpers ---------- */

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError("Request timed out.", 408);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* ====================== GROQ ====================== */

function scoreWhisper(data: WhisperResponse): { score: number; silent: boolean } {
  const segments = data.segments ?? [];
  const text = (data.text ?? "").trim();

  if (segments.length === 0) {
    return { score: text ? -1 : -10, silent: !text };
  }

  let weighted = 0;
  let total = 0;
  let silentCount = 0;

  for (const s of segments) {
    const dur = Math.max((s.end ?? 0) - (s.start ?? 0), 0.1);
    weighted += (s.avg_logprob ?? -1) * dur;
    total += dur;
    if ((s.no_speech_prob ?? 0) > 0.9 && (s.avg_logprob ?? 0) < -1.5) {
      silentCount += 1;
    }
  }

  return {
    score: weighted / total,
    silent: silentCount === segments.length, // sirf tab jab SAB silence ho
  };
}

async function callWhisper(
  audio: File,
  apiKey: string,
  model: string,
  pass: Pass,
  prompt: string,
  timeoutMs: number,
): Promise<WhisperResponse> {
  const formData = new FormData();
  formData.append("file", audio, audio.name);
  formData.append("model", model);
  formData.append("response_format", "verbose_json");
  formData.append("temperature", "0");
  if (prompt) formData.append("prompt", prompt);
  if (pass === "hi") formData.append("language", "hi");

  const response = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    },
    timeoutMs,
  );

  const data = await readJson<WhisperResponse>(response);

  if (!response.ok) {
    throw new HttpError(
      data?.error?.message || `Groq failed (${response.status}).`,
      response.status,
    );
  }

  return data ?? {};
}

async function runGroqPass(
  audio: File,
  pass: Pass,
  prompt: string,
  deadline: number,
): Promise<GroqCandidate> {
  const keys = rotateKeys(getGroqKeys());
  if (keys.length === 0) throw new HttpError("GROQ_API_KEY missing.", 500);

  let lastError: unknown = null;

  for (const model of GROQ_MODELS) {
    let overloads = 0;

    for (const [index, key] of keys.entries()) {
      if (overloads >= MAX_OVERLOADS_PER_MODEL) break; // agla model

      const remaining = deadline - Date.now();
      if (remaining < 3000) {
        throw lastError ?? new HttpError("Groq time budget exhausted.", 504);
      }

      try {
        const data = await callWhisper(
          audio, key, model, pass, prompt,
          Math.min(GROQ_TIMEOUT_MS, remaining),
        );
        const { score, silent } = scoreWhisper(data);
        return {
          pass,
          text: (data.text ?? "").trim(),
          language: data.language || pass,
          score,
          silent,
        };
      } catch (error) {
        lastError = error;
        const status = error instanceof HttpError ? error.status : 0;
        console.error(
          `[Voice][Groq] pass=${pass} model=${model} key=${index + 1}/${keys.length} status=${status}:`,
          error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
        );

        // Audio ki hi problem hai, aage koshish bekaar
        if (status === 400 || status === 413 || status === 422) throw error;

        // Server overload / timeout: model-wide hota hai
        if (status === 408 || status === 503 || status === 0) overloads += 1;

        // 429 / 401 / 403: bas agli key try hogi
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new HttpError("Groq transcription failed.", 502);
}

async function transcribeWithGroq(
  audio: File,
  prompt: string,
  deadline: number,
): Promise<{ best: GroqCandidate; alternatives: string[] }> {
  const first = await runGroqPass(audio, "auto", prompt, deadline);

  if (first.silent || !first.text) return { best: first, alternatives: [] };

  const needsSecondPass =
    first.score < SECOND_PASS_BELOW || !isKnownLanguage(first.language);

  if (!needsSecondPass || deadline - Date.now() < 4000) {
    return { best: first, alternatives: [] };
  }

  try {
    const second = await runGroqPass(audio, "hi", prompt, deadline);
    if (second.text && !second.silent) {
      return second.score > first.score
        ? { best: second, alternatives: [first.text] }
        : { best: first, alternatives: [second.text] };
    }
  } catch {
    console.warn("[Voice][Groq] second pass failed, using first result");
  }

  return { best: first, alternatives: [] };
}

/* ====================== GEMINI ====================== */

async function callGemini(
  apiKey: string,
  model: string,
  audioBase64: string,
  mimeType: string,
  hints: string[],
  timeoutMs: number,
): Promise<string> {
  const instruction =
    "Transcribe this audio exactly as spoken, word for word. " +
    "The speaker may mix Hindi and English in the same sentence. " +
    "Write Hindi words in Devanagari script and English words in English letters. " +
    "Write ALL numbers as digits (0-9), never as words or Devanagari digits: " +
    "phone numbers, years, dates, times, ages (e.g. 9876543210, 1985, 14 June, 5:30, 38). " +
    "Do NOT translate, summarize, correct grammar or add anything. " +
    "Keep proper names (people, places) exactly as pronounced. " +
    (hints.length ? `These names/words may appear: ${hints.join(", ")}. ` : "") +
    "If there is no speech, output exactly: [NO_SPEECH]. " +
    "Output only the transcript.";

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: instruction },
              { inline_data: { mime_type: mimeType, data: audioBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    },
    timeoutMs,
  );

  const data = await readJson<GeminiResponse>(response);

  if (!response.ok) {
    throw new HttpError(
      data?.error ? JSON.stringify(data.error) : `Gemini failed (${response.status}).`,
      response.status,
    );
  }

  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new HttpError("Gemini returned empty transcript.", 502);

  return text === "[NO_SPEECH]" ? "" : text;
}

async function transcribeWithGemini(
  audio: File,
  hints: string[],
  deadline: number,
): Promise<string> {
  const keys = rotateKeys(getGeminiKeys());
  if (keys.length === 0) throw new HttpError("GEMINI_API_KEY missing.", 500);

  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const mimeType = audio.type || "audio/webm";

  let lastError: unknown = null;

  for (const model of GEMINI_MODELS) {
    let overloads = 0;

    for (const [index, key] of keys.entries()) {
      if (overloads >= MAX_OVERLOADS_PER_MODEL) break; // agla model

      const remaining = deadline - Date.now();
      if (remaining < 3000) {
        throw lastError ?? new HttpError("Gemini time budget exhausted.", 504);
      }

      try {
        return await callGemini(
          key, model, base64, mimeType, hints,
          Math.min(GEMINI_TIMEOUT_MS, remaining),
        );
      } catch (error) {
        lastError = error;
        const status = error instanceof HttpError ? error.status : 0;
        console.error(
          `[Voice][Gemini] model=${model} key=${index + 1}/${keys.length} status=${status}:`,
          error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
        );

        // Server overload / timeout: model-wide hota hai
        if (status === 503 || status === 408 || status === 0) overloads += 1;

        // Model hi exist nahi karta: agla model
        if (status === 404) break;

        // 429 / 400 (invalid key) / 403: bas agli key try hogi
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new HttpError("Gemini transcription failed.", 502);
}

/* ====================== MAIN FLOW ====================== */

async function transcribe(audio: File, hints: string[]): Promise<TranscriptResult> {
  const now = Date.now();
  const deadline = now + TOTAL_BUDGET_MS;
  const groqDeadline = now + GROQ_BUDGET_MS;
  const prompt = buildVocabularyPrompt(hints);

  let groqBest: GroqCandidate | null = null;
  let groqAlternatives: string[] = [];
  let groqError: unknown = null;

  /* ---- 1) Groq ---- */
  try {
    const groq = await transcribeWithGroq(audio, prompt, groqDeadline);
    groqBest = groq.best;
    groqAlternatives = groq.alternatives;
  } catch (error) {
    groqError = error;
    const status = error instanceof HttpError ? error.status : 0;
    if (status === 400 || status === 413 || status === 422) throw error;
  }

  if (groqBest) {
    // Poori recording silent: Gemini ko mat bulao
    if (groqBest.silent || !groqBest.text) {
      return {
        text: "",
        source: "groq",
        confidence: "high",
        language: "unknown",
        alternatives: [],
      };
    }

    const confident =
      groqBest.score >= GEMINI_VERIFY_BELOW && isKnownLanguage(groqBest.language);

    if (confident) {
      return {
        text: groqBest.text,
        source: "groq",
        confidence: "high",
        language: groqBest.language,
        alternatives: groqAlternatives,
      };
    }
  }

  /* ---- 2) Gemini (fallback ya verification) ---- */
  try {
    const geminiText = await transcribeWithGemini(audio, hints, deadline);

    if (!geminiText) {
      if (groqBest) {
        return {
          text: groqBest.text,
          source: "groq",
          confidence: "check",
          language: groqBest.language,
          alternatives: groqAlternatives,
        };
      }
      return {
        text: "",
        source: "gemini",
        confidence: "high",
        language: "unknown",
        alternatives: [],
      };
    }

    return {
      text: geminiText,
      source: "gemini",
      confidence: "check", // Gemini ka koi score nahi, user se check karwao
      language: "mixed",
      alternatives: groqBest ? [groqBest.text, ...groqAlternatives] : [],
    };
  } catch (geminiError) {
    // Gemini fail, par Groq ka kam-confidence result hai: wahi do, "check" ke saath
    if (groqBest && groqBest.text) {
      return {
        text: groqBest.text,
        source: "groq",
        confidence: "check",
        language: groqBest.language,
        alternatives: groqAlternatives,
      };
    }
    throw geminiError instanceof Error
      ? geminiError
      : groqError instanceof Error
        ? groqError
        : new HttpError("Voice transcription failed.", 502);
  }
}

/* ====================== POST ====================== */

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }
    if (audio.size < MIN_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Recording is too short. Please speak again." },
        { status: 400 },
      );
    }
    if (audio.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Recording is too long. Please keep it under a minute." },
        { status: 413 },
      );
    }

    const hints = parseHints(formData.get("hints"));
    const result = await transcribe(normalizeAudio(audio), hints);

    // Numbers hamesha digits mein (words / Devanagari digits -> 0-9)
    const text = normalizeNumbers(result.text);

    return NextResponse.json({
      text,
      noSpeech: text.length === 0,
      confidence: result.confidence, // "high" | "check"
      source: result.source, // "groq" | "gemini"
      provider: result.source, // purane frontend ke liye
      language: result.language,
      alternatives: result.alternatives.map(normalizeNumbers),
    });
  } catch (error: unknown) {
    const status = error instanceof HttpError ? error.status : 500;
    console.error(
      "[Voice] Route error:",
      error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
    );

    const message =
      status === 408 || status === 504
        ? "Voice took too long. Please try again or type your question."
        : status === 400 || status === 422
          ? "Could not read this recording. Please try again."
          : status === 429
            ? "Voice service is busy right now. Please type your question."
            : "Voice is unavailable right now. Please type your question.";

    return NextResponse.json(
      {
        error: message,
        fallback: "browser", // frontend ko browser speech / typing pe bhejo
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}