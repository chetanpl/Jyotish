type ConversationMemory = {
  summary: string;
  summaryMessageCount: number;
  expiresAt: number;
};

const cache = new Map<
  string,
  ConversationMemory
>();

const CACHE_TTL =
  Number(
    process.env.CONVERSATION_CACHE_TTL ??
      86400,
  ) * 1000;

function isExpired(
  memory: ConversationMemory,
) {
  return (
    Date.now() >=
    memory.expiresAt
  );
}

export function getConversationMemory(
  sessionId: string,
) {
  const memory =
    cache.get(sessionId);

  console.log("🔎 CACHE GET:", {
    sessionId,
    found: Boolean(memory),
    cacheSize: cache.size,
  });

  if (!memory) {
    return null;
  }

  if (isExpired(memory)) {
    console.log("⏰ CACHE EXPIRED:", {
      sessionId,
    });

    cache.delete(sessionId);
    return null;
  }

  console.log("✅ CACHE HIT:", {
    sessionId,
    summaryMessageCount:
      memory.summaryMessageCount,
    summaryLength:
      memory.summary.length,
  });

  return {
    summary:
      memory.summary,

    summaryMessageCount:
      memory.summaryMessageCount,
  };
}

export function setConversationMemory(
  sessionId: string,
  memory: {
    summary: string;
    summaryMessageCount: number;
  },
) {
  console.log("💾 CACHE SET:", {
    sessionId,
    summaryMessageCount:
      memory.summaryMessageCount,
    summaryLength:
      memory.summary.length,
  });

  cache.set(
    sessionId,
    {
      summary:
        memory.summary,

      summaryMessageCount:
        memory.summaryMessageCount,

      expiresAt:
        Date.now() + CACHE_TTL,
    },
  );

  console.log("📦 CACHE SIZE:", cache.size);
}

export function deleteConversationMemory(
  sessionId: string,
) {
  cache.delete(sessionId);
}

export function clearConversationCache() {
  cache.clear();
}