import type {
  AstroSessionMessage,
} from "./astroSession";

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

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return fallback;
  }

  return value;
}

export const MAX_RECENT_MESSAGES =
  getPositiveIntEnv(
    "MAX_RECENT_MESSAGES",
    8,
    2,
    30,
  );

export const MAX_SUMMARY_CHARS =
  getPositiveIntEnv(
    "MAX_SUMMARY_CHARS",
    4000,
    500,
    20000,
  );

export const SUMMARY_UPDATE_INTERVAL_MESSAGES =
  getPositiveIntEnv(
    "SUMMARY_UPDATE_INTERVAL_MESSAGES",
    8,
    1,
    50,
  );

export function trimSummaryToLimit(
  text: string,
): string {
  const normalized =
    text
      .trim()
      .replace(
        /[ \t]+\n/g,
        "\n",
      )
      .replace(
        /\n{3,}/g,
        "\n\n",
      );

  if (
    normalized.length <=
    MAX_SUMMARY_CHARS
  ) {
    return normalized;
  }

  const candidate =
    normalized.slice(
      0,
      MAX_SUMMARY_CHARS,
    );

  const sentenceBreak =
    Math.max(
      candidate.lastIndexOf(
        ". ",
      ),
      candidate.lastIndexOf(
        "। ",
      ),
      candidate.lastIndexOf(
        "\n",
      ),
    );

  if (
    sentenceBreak >=
    Math.floor(
      MAX_SUMMARY_CHARS *
        0.65,
    )
  ) {
    return candidate
      .slice(
        0,
        sentenceBreak + 1,
      )
      .trim();
  }

  const whitespace =
    candidate.lastIndexOf(
      " ",
    );

  if (
    whitespace >=
    Math.floor(
      MAX_SUMMARY_CHARS *
        0.75,
    )
  ) {
    return candidate
      .slice(
        0,
        whitespace,
      )
      .trim();
  }

  return candidate.trim();
}

export function getOlderMessages(
  messages: AstroSessionMessage[],
): AstroSessionMessage[] {
  const recentStart =
    Math.max(
      0,
      messages.length -
        MAX_RECENT_MESSAGES,
    );

  return messages.slice(
    0,
    recentStart,
  );
}

export function getRecentMessages(
  messages: AstroSessionMessage[],
): AstroSessionMessage[] {
  return messages.slice(
    -MAX_RECENT_MESSAGES,
  );
}

export function getUnsummarizedMessages(
  messages: AstroSessionMessage[],
  summaryMessageCount: number,
): AstroSessionMessage[] {
  const olderMessages =
    getOlderMessages(
      messages,
    );

  const safeCount =
    Math.min(
      Math.max(
        0,
        summaryMessageCount,
      ),
      olderMessages.length,
    );

  return olderMessages.slice(
    safeCount,
  );
}

export function shouldUpdateSummary(
  messages: AstroSessionMessage[],
  summary: string,
  summaryMessageCount: number,
): boolean {
  const olderMessages =
    getOlderMessages(
      messages,
    );

  if (
    olderMessages.length ===
    0
  ) {
    return false;
  }

  if (!summary.trim()) {
    return true;
  }

  const safeCount =
    Math.min(
      Math.max(
        0,
        summaryMessageCount,
      ),
      olderMessages.length,
    );

  const unsummarizedCount =
    olderMessages.length -
    safeCount;

  return (
    unsummarizedCount >=
    SUMMARY_UPDATE_INTERVAL_MESSAGES
  );
}

export function formatMessagesForSummary(
  messages: AstroSessionMessage[],
): string {
  return messages
    .map(
      (
        message,
        index,
      ) => {
        const role =
          message.role ===
          "assistant"
            ? "Assistant"
            : "User";

        return `[${index + 1}] ${role}:\n${message.content}`;
      },
    )
    .join("\n\n");
}

export function formatMessagesForGemini(
  messages: AstroSessionMessage[],
): Array<{
  role: "user" | "model";
  parts: Array<{
    text: string;
  }>;
}> {
  return messages
    .filter(
      (
        message,
      ) =>
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
              message.content.trim(),
          },
        ],
      }),
    );
}