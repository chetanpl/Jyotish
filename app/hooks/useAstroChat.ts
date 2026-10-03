"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  validateChatRequest,
  type AnswerLanguage,
  type ChatResponse,
  type Message,
  type ValidationKey,
} from "@/lib/astro-ui";

import type { BirthProfileState, UiText } from "@/components/astro/types";

export const CHAT_COOLDOWN_SECONDS = 60;

const COOLDOWN_STORAGE_KEY = "pal-jyotish-ai-chat-cooldown-until";

const COOLDOWN_BYPASS_PARAM = "bypass";
const COOLDOWN_BYPASS_CODE = "7890";

/**
 * Feedback is shown only once per browser session.
 *
 * The session id itself is also persisted in sessionStorage,
 * so a page refresh does not create a completely new chat
 * session for feedback purposes.
 */
const CHAT_SESSION_STORAGE_KEY = "pal-jyotish-ai-chat-session-id";

const FEEDBACK_SHOWN_STORAGE_PREFIX = "pal-jyotish-feedback-shown:";

/* =========================================================
   CONTENT VALIDATION
   ========================================================= */

const BLOCKED_WORDS = [
  "fuck",
  "fucking",
  "fucked",
  "fucker",
  "shit",
  "shitty",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "piss",
  "slut",
  "whore",

  "porn",
  "pornography",
  "porno",
  "xxx",
  "sexvideo",
  "sexvideos",
  "nude",
  "nudes",
  "naked",
  "blowjob",
  "handjob",
  "masturbation",
  "masturbate",
  "orgasm",
];

function normalizeForValidation(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedWord(value: string): boolean {
  const normalized = normalizeForValidation(value);

  if (!normalized) {
    return false;
  }

  const words = normalized.split(" ");

  return words.some((word) => BLOCKED_WORDS.includes(word));
}

function hasTooManyConsecutiveSpecialCharacters(value: string): boolean {
  return /[^a-zA-Z0-9\s]{3,}/.test(value);
}

function validateUserInput(value: string): string | null {
  if (containsBlockedWord(value)) {
    return "Please avoid abusive or explicit language.";
  }

  if (hasTooManyConsecutiveSpecialCharacters(value)) {
    return "Please use no more than 2 special characters together.";
  }

  return null;
}

/* =========================================================
   COOLDOWN
   ========================================================= */

function hasCooldownBypass(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      new URLSearchParams(window.location.search).get(COOLDOWN_BYPASS_PARAM) ===
      COOLDOWN_BYPASS_CODE
    );
  } catch {
    return false;
  }
}

type Options = {
  profile: BirthProfileState;
  language: AnswerLanguage;
  t: UiText;
};

export type AstroMessage = Message & {
  id: string;
  question?: string;
};

function createMessageId(): string {
  return crypto.randomUUID();
}

/* =========================================================
   CHAT SESSION
   ========================================================= */

function getOrCreateChatSessionId(): string {
  if (typeof window === "undefined") {
    return crypto.randomUUID();
  }

  try {
    const existing = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);

    if (existing) {
      return existing;
    }

    const newSessionId = crypto.randomUUID();

    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, newSessionId);

    return newSessionId;
  } catch {
    return crypto.randomUUID();
  }
}

/* =========================================================
   INITIAL COOLDOWN
   ========================================================= */

function getInitialCooldownSeconds(): number {
  return 0;
}

/* =========================================================
   HOOK
   ========================================================= */

export function useAstroChat({ profile, language, t }: Options) {
  const [sessionId] = useState<string>(getOrCreateChatSessionId);

  const [input, setInput] = useState<string>("");

  const [messages, setMessages] = useState<AstroMessage[]>([]);

  const [sending, setSending] = useState<boolean>(false);

  const [validationMessage, setValidationMessage] =
    useState<ValidationKey | null>(null);

  const [inputValidationError, setInputValidationError] = useState<
    string | null
  >(null);

  const [conversationTopic, setConversationTopic] = useState<string>("");

  const [cooldownRemaining, setCooldownRemaining] = useState<number>(
    getInitialCooldownSeconds,
  );

  /**
   * First successful assistant message that gets
   * the feedback form.
   */
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(
    null,
  );

  /**
   * Controls the temporary "How did we do?" notice.
   *
   * The FeedbackBox itself remains visible after this
   * notification disappears.
   */
  const [feedbackNotificationVisible, setFeedbackNotificationVisible] =
    useState<boolean>(false);

  /**
   * Web Audio API context used for the tiny feedback
   * notification sound.
   */
  const audioContextRef = useRef<AudioContext | null>(null);

  const notificationTimeoutRef = useRef<number | null>(null);

  /* =======================================================
     FEEDBACK STORAGE
     ======================================================= */

  function getFeedbackStorageKey(): string {
    return `${FEEDBACK_SHOWN_STORAGE_PREFIX}${sessionId}`;
  }

  function hasFeedbackAlreadyBeenShown(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.sessionStorage.getItem(getFeedbackStorageKey()) === "true";
    } catch {
      return false;
    }
  }

  function markFeedbackAsShown(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(getFeedbackStorageKey(), "true");
    } catch {
      // Ignore sessionStorage errors.
    }
  }

  /* =======================================================
     FEEDBACK SOUND
     ======================================================= */

  /**
   * Creates/resumes the AudioContext while the user is
   * interacting with the chat.
   *
   * This helps browsers such as Chrome/Safari allow the
   * later notification sound after the API response.
   */
  function prepareFeedbackSound(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }

      const context = audioContextRef.current;

      if (context.state === "suspended") {
        void context.resume();
      }
    } catch {
      // Sound is optional. Never break chat if audio fails.
    }
  }

  /**
   * Very small, soft two-tone notification.
   *
   * No audio file is required.
   */
  function playFeedbackSound(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const context = audioContextRef.current;

      if (!context) {
        return;
      }

      if (context.state === "suspended") {
        void context.resume();
      }

      const now = context.currentTime;

      const gain = context.createGain();

      gain.gain.setValueAtTime(0.0001, now);

      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);

      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      gain.connect(context.destination);

      const oscillator = context.createOscillator();

      oscillator.type = "sine";

      oscillator.frequency.setValueAtTime(660, now);

      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.16);

      oscillator.connect(gain);

      oscillator.start(now);
      oscillator.stop(now + 0.34);

      oscillator.addEventListener(
        "ended",
        () => {
          try {
            gain.disconnect();
          } catch {
            // Ignore cleanup errors.
          }
        },
        { once: true },
      );
    } catch {
      // Sound is optional. Never break chat if audio fails.
    }
  }

  /**
   * Shows notification for a short time.
   *
   * The form itself does NOT disappear afterwards.
   */
  function showFeedbackNotification(): void {
    if (notificationTimeoutRef.current !== null) {
      window.clearTimeout(notificationTimeoutRef.current);
    }

    setFeedbackNotificationVisible(true);

    notificationTimeoutRef.current = window.setTimeout(() => {
      setFeedbackNotificationVisible(false);

      notificationTimeoutRef.current = null;
    }, 4200);
  }

  /* =======================================================
     CLEANUP
     ======================================================= */

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current);
      }

      try {
        if (audioContextRef.current) {
          void audioContextRef.current.close();
        }
      } catch {
        // Ignore audio cleanup errors.
      }
    };
  }, []);

  /* =======================================================
     RESTORE COOLDOWN
     ======================================================= */

  useEffect(() => {
    if (hasCooldownBypass()) {
      try {
        window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      } catch {
        // Ignore localStorage errors.
      }

      return;
    }

    let timeoutId: number | undefined;

    try {
      const saved = Number(window.localStorage.getItem(COOLDOWN_STORAGE_KEY));

      if (Number.isFinite(saved) && saved > 0) {
        const remainingSeconds = Math.ceil((saved - Date.now()) / 1000);

        if (remainingSeconds > 0) {
          timeoutId = window.setTimeout(() => {
            setCooldownRemaining(remainingSeconds);
          }, 0);
        } else {
          window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore localStorage errors.
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  /* =======================================================
     COOLDOWN TIMER
     ======================================================= */

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCooldownRemaining((current) => {
        const next = Math.max(0, current - 1);

        if (next === 0) {
          try {
            window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
          } catch {
            // Ignore localStorage errors.
          }
        }

        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownRemaining]);

  /* =======================================================
     START COOLDOWN
     ======================================================= */

  function startCooldown(): void {
    if (hasCooldownBypass()) {
      return;
    }

    const endsAt = Date.now() + CHAT_COOLDOWN_SECONDS * 1000;

    try {
      window.localStorage.setItem(COOLDOWN_STORAGE_KEY, String(endsAt));
    } catch {
      // Ignore localStorage errors.
    }

    setCooldownRemaining(CHAT_COOLDOWN_SECONDS);
  }

  /* =======================================================
     VALIDATION
     ======================================================= */

  const validationText =
    validationMessage === null ? null : t.validation[validationMessage];

  function clearValidation(): void {
    setValidationMessage(null);
    setInputValidationError(null);
  }

  /* =======================================================
     INPUT CHANGE
     ======================================================= */

  function handleInputChange(value: string): void {
    setInput(value);
    setValidationMessage(null);

    const contentError = validateUserInput(value);

    setInputValidationError(contentError);
  }

  /* =======================================================
     QUICK QUESTIONS
     ======================================================= */

  function selectQuickQuestion(question: string): void {
    setInput(question);
    setValidationMessage(null);

    const contentError = validateUserInput(question);

    setInputValidationError(contentError);
  }

  /* =======================================================
     CAN SEND
     ======================================================= */

  function canSend(): boolean {
    const contentError = validateUserInput(input);

    return (
      validateChatRequest(profile, input) === null &&
      contentError === null &&
      inputValidationError === null &&
      !sending &&
      cooldownRemaining === 0
    );
  }

  /* =======================================================
     SEND MESSAGE
     ======================================================= */

  async function sendMessage(): Promise<void> {
    if (sending || cooldownRemaining > 0) {
      return;
    }

    const question = input.trim();

    const contentError = validateUserInput(question);

    if (contentError !== null) {
      setInputValidationError(contentError);

      return;
    }

    const validationKey = validateChatRequest(profile, question);

    if (validationKey !== null) {
      setValidationMessage(validationKey);

      return;
    }

    /*
     * Unlock/prep audio during the user's send action.
     *
     * The actual sound is only played after the first
     * successful AI answer.
     */
    prepareFeedbackSound();

    /* =====================================================
       USER MESSAGE
       ===================================================== */

    const userMessage: AstroMessage = {
      id: createMessageId(),
      role: "user",
      content: question,
    };

    setMessages((current) => [...current, userMessage]);

    setInput("");
    setValidationMessage(null);
    setInputValidationError(null);
    setSending(true);

    /* =====================================================
       API REQUEST
       ===================================================== */

    try {
      const response = await fetch("/api/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify({
          sessionId,

          profile,

          language,

          messages: [
            {
              role: "user",
              content: question,
            },
          ],

          conversationTopic,
        }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(data.error ?? t.errors.chat);
      }

      const answer =
        typeof data.message === "string" ? data.message : t.errors.emptyAnswer;

      /* ===================================================
         ASSISTANT MESSAGE
      =================================================== */

      const assistantMessage: AstroMessage = {
        id: createMessageId(),
        role: "assistant",
        content: answer,
        question,
      };

      setMessages((current) => [...current, assistantMessage]);

      /* ===================================================
         FIRST SUCCESSFUL ANSWER → FEEDBACK
      =================================================== */

      /**
       * IMPORTANT:
       *
       * Feedback is triggered only here, after the API
       * successfully returned an answer.
       *
       * Follow-up answers do not create another form.
       *
       * sessionStorage prevents the feedback from being
       * triggered again after a page refresh during the
       * same browser session.
       */
      const feedbackAlreadyShown = hasFeedbackAlreadyBeenShown();

      if (!feedbackAlreadyShown) {
        markFeedbackAsShown();

        setFeedbackMessageId(assistantMessage.id);

        showFeedbackNotification();

        playFeedbackSound();
      }

      /* ===================================================
         CONVERSATION TOPIC
      =================================================== */

      setConversationTopic(
        typeof data.conversationTopic === "string"
          ? data.conversationTopic
          : "",
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : t.errors.generic;

      const errorMessageItem: AstroMessage = {
        id: createMessageId(),
        role: "assistant",
        content: errorMessage,
        question,
      };

      setMessages((current) => [...current, errorMessageItem]);
    } finally {
      setSending(false);
      startCooldown();
    }
  }

  /* =======================================================
     KEYBOARD
     ======================================================= */

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      void sendMessage();
    }
  }

  /* =======================================================
     RETURN
     ======================================================= */

  return {
    sessionId,

    input,

    messages,

    sending,

    validationMessage,

    validationText,

    inputValidationError,

    cooldownRemaining,

    conversationTopic,

    profile,

    feedbackMessageId,

    feedbackNotificationVisible,

    clearValidation,

    handleInputChange,

    selectQuickQuestion,

    canSend,

    sendMessage,

    handleKeyDown,
  };
}
