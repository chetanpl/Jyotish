import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

function getPositiveIntEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }

  return value;
}

const SESSION_TTL_SECONDS = getPositiveIntEnv(
  "SESSION_TTL_SECONDS",
  86400,
  300,
  60 * 60 * 24 * 30,
);

const MAX_SESSION_MESSAGES = getPositiveIntEnv(
  "MAX_SESSION_MESSAGES",
  100,
  10,
  500,
);

export type SessionMessageRole = "user" | "assistant";

export type AstroSessionMessage = {
  role: SessionMessageRole;
  content: string;
  createdAt: string;
};

export type AstroSession = {
  id: string;

  profile: unknown;

  /*
   * This contains the expensive natal chart calculation.
   *
   * The route can refresh dynamic/current fields such as
   * the current Vimshottari Dasha when the session is loaded.
   */
  chart: unknown;

  language: string;

  messages: AstroSessionMessage[];

  conversationSummary: string;

  /*
   * Number of messages already represented by the summary.
   */
  conversationSummaryMessageCount: number;

  createdAt: string;

  updatedAt: string;
};

function getSessionKey(sessionId: string): string {
  return `astro:session:${sessionId}`;
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

function getNow(): string {
  return new Date().toISOString();
}

function normalizeSession(session: AstroSession): AstroSession {
  return {
    ...session,

    messages: Array.isArray(session.messages)
      ? session.messages.slice(-MAX_SESSION_MESSAGES)
      : [],

    conversationSummary:
      typeof session.conversationSummary === "string"
        ? session.conversationSummary
        : "",

    conversationSummaryMessageCount: Number.isInteger(
      session.conversationSummaryMessageCount,
    )
      ? Math.max(0, session.conversationSummaryMessageCount)
      : 0,
  };
}

export async function createAstroSession(params: {
  profile: unknown;
  chart: unknown;
  language: string;
}): Promise<AstroSession> {
  const id = generateSessionId();

  const timestamp = getNow();

  const session: AstroSession = {
    id,

    profile: params.profile,

    chart: params.chart,

    language: params.language,

    messages: [],

    conversationSummary: "",

    conversationSummaryMessageCount: 0,

    createdAt: timestamp,

    updatedAt: timestamp,
  };

  await redis.set(getSessionKey(id), session, {
    ex: SESSION_TTL_SECONDS,
  });

  return session;
}

export async function getAstroSession(
  sessionId: string,
): Promise<AstroSession | null> {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return null;
  }

  const session = await redis.get<AstroSession>(
    getSessionKey(sessionId.trim()),
  );

  if (!session) {
    return null;
  }

  return normalizeSession(session);
}

export async function saveAstroSession(
  session: AstroSession,
): Promise<AstroSession> {
  const normalized = normalizeSession({
    ...session,

    updatedAt: getNow(),
  });

  await redis.set(getSessionKey(normalized.id), normalized, {
    ex: SESSION_TTL_SECONDS,
  });

  return normalized;
}

export async function addAstroSessionMessage(
  session: AstroSession,
  message: {
    role: SessionMessageRole;
    content: string;
  },
): Promise<AstroSession> {
  const content = message.content.trim();

  if (!content) {
    return session;
  }

  const updated: AstroSession = {
    ...session,

    messages: [
      ...session.messages,

      {
        role: message.role,

        content,

        createdAt: getNow(),
      },
    ].slice(-MAX_SESSION_MESSAGES),

    updatedAt: getNow(),
  };

  return saveAstroSession(updated);
}

export async function updateAstroSessionMemory(
  session: AstroSession,
  params: {
    conversationSummary?: string;
    conversationSummaryMessageCount?: number;
    language?: string;
  },
): Promise<AstroSession> {
  const updated: AstroSession = {
    ...session,

    ...(typeof params.conversationSummary === "string"
      ? {
          conversationSummary: params.conversationSummary,
        }
      : {}),

    ...(Number.isInteger(params.conversationSummaryMessageCount)
      ? {
          conversationSummaryMessageCount: Math.max(
            0,
            params.conversationSummaryMessageCount!,
          ),
        }
      : {}),

    ...(typeof params.language === "string"
      ? {
          language: params.language,
        }
      : {}),

    updatedAt: getNow(),
  };

  return saveAstroSession(updated);
}

export async function updateAstroSessionChart(
  session: AstroSession,
  chart: unknown,
): Promise<AstroSession> {
  return saveAstroSession({
    ...session,

    chart,

    updatedAt: getNow(),
  });
}

export async function deleteAstroSession(sessionId: string): Promise<void> {
  if (!sessionId.trim()) {
    return;
  }

  await redis.del(getSessionKey(sessionId.trim()));
}
