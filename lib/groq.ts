import Groq from "groq-sdk";

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GroqResult = {
  answer: string;
};

const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

const GROQ_MAX_OUTPUT_TOKENS = Number(
  process.env.GROQ_MAX_OUTPUT_TOKENS || "6144",
);

const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || "30000");

const GROQ_MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || "2");

const GROQ_RETRY_DELAY_MS = Number(process.env.GROQ_RETRY_DELAY_MS || "1000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGroqApiKeys(): string[] {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY1,
    process.env.GROQ_API_KEY2,
    process.env.GROQ_API_KEY3,
    process.env.GROQ_API_KEY4,
    process.env.GROQ_API_KEY5,
  ];

  return [
    ...new Set(
      keys
        .map((key) => key?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

function extractText(response: {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}): string {
  const text = response.choices?.[0]?.message?.content;

  return typeof text === "string" ? text.trim() : "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

function getErrorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === "number") {
      return status;
    }
  }

  return 0;
}

function isRetryableStatus(status: number): boolean {
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

function isInsufficientBalanceError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("insufficient") ||
    message.includes("balance") ||
    message.includes("credits") ||
    message.includes("credit") ||
    message.includes("billing") ||
    message.includes("payment required")
  );
}

export async function callGroq(messages: GroqMessage[]): Promise<GroqResult> {
  const apiKeys = getGroqApiKeys();

  if (apiKeys.length === 0) {
    throw new Error("GROQ_API_KEY_NOT_CONFIGURED");
  }

  let lastError: unknown = null;

  /*
   * Try each Groq API key.
   *
   * For each key:
   *   attempt 1
   *   attempt 2
   *   attempt 3
   *
   * Then move to the next key.
   */
  for (const apiKey of apiKeys) {
    const groq = new Groq({
      apiKey,
      timeout: GROQ_TIMEOUT_MS,
    });

    for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt += 1) {
      try {
        const response = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          max_tokens: GROQ_MAX_OUTPUT_TOKENS,
        });

        const answer = extractText(response);

        if (!answer) {
          throw new Error("GROQ_EMPTY_RESPONSE");
        }

        return {
          answer,
        };
      } catch (error: unknown) {
        lastError = error;

        /*
         * Do not keep retrying if the account has
         * insufficient balance/credits.
         */
        if (isInsufficientBalanceError(error)) {
          throw new Error("GROQ_INSUFFICIENT_BALANCE");
        }

        const status = getErrorStatus(error);

        const retryable = isRetryableStatus(status);

        /*
         * If the error is not retryable, immediately
         * move to the next API key.
         */
        if (!retryable) {
          break;
        }

        /*
         * If all retries for this key are exhausted,
         * move to the next key.
         */
        if (attempt >= GROQ_MAX_RETRIES) {
          break;
        }

        /*
         * Short retry delay.
         *
         * Example with GROQ_RETRY_DELAY_MS=1000:
         * attempt 1 -> wait 1 second
         * attempt 2 -> wait 2 seconds
         */
        await sleep(GROQ_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("GROQ_REQUEST_FAILED");
}
