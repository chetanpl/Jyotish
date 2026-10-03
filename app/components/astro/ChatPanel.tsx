"use client";

import {
  CHAT_COOLDOWN_SECONDS,
  type useAstroChat,
} from "./../../hooks/useAstroChat";

import type { UiText } from "./types";
import type { AnswerLanguage } from "@/lib/astro-ui";

import FeedbackBox from "./FeedbackBox";

type Props = {
  t: UiText;
  language: AnswerLanguage;
  chat: ReturnType<typeof useAstroChat>;
};

export default function ChatPanel({ t, language, chat }: Props) {
  const {
    input,
    messages,
    sending,
    validationText,
    inputValidationError,
    cooldownRemaining,
    handleInputChange,
    selectQuickQuestion,
    canSend,
    sendMessage,
    handleKeyDown,
    feedbackMessageId,
  } = chat;

  const minutes = String(Math.floor(cooldownRemaining / 60)).padStart(2, "0");

  const seconds = String(cooldownRemaining % 60).padStart(2, "0");

  const displayedValidationError = inputValidationError ?? validationText;

  const hasValidationError = displayedValidationError !== null;

  /*
   * ==========================================================
   * FIRST AI ANSWER FOR FEEDBACK
   * ==========================================================
   *
   * useAstroChat first successful AI answer ka ID deta hai.
   *
   * Hum sirf us message ko find kar rahe hain.
   *
   * Koi state update nahi.
   * Koi sessionStorage nahi.
   * Koi render-time side effect nahi.
   */

  const feedbackMessage =
    feedbackMessageId === null
      ? null
      : messages.find(
          (message) =>
            message.id === feedbackMessageId && message.role === "assistant",
        );

  return (
    <section className="astro-chat flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-[#e3ded5]/90 bg-white/95 shadow-[0_8px_30px_rgba(67,53,34,0.07)] backdrop-blur-sm">
      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="border-b border-[#e8e3da] bg-[#faf9f6]/95 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="astro-chat-om relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#6b4f8a] text-lg text-white">
            ॐ
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#303746]">
              {t.chat.title}
            </h3>

            <p className="mt-0.5 text-[11px] text-[#8b94a2]">
              {t.chat.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          MESSAGES
      ====================================================== */}

      <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
        {messages.length === 0 && (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="max-w-md text-center">
              <div className="astro-welcome-om mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6b4f8a]/10 text-3xl text-[#6b4f8a]">
                ॐ
              </div>

              <h4 className="text-lg font-semibold text-[#3b4352]">
                {t.chat.welcomeTitle}
              </h4>

              <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
                {t.chat.welcomeDescription}
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {t.chat.quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => selectQuickQuestion(question)}
                    className="astro-chip rounded-full border border-[#ddd7cd] bg-[#faf9f6] px-3 py-2 text-xs text-[#697282]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === "user";

          const isAssistant = message.role === "assistant";

          return (
            <div
              key={message.id}
              className={`astro-message flex ${
                isUser ? "justify-end" : "justify-start"
              }`}
              style={{
                animationDelay: `${Math.min(index * 70, 500)}ms`,
              }}
            >
              <div className={isAssistant ? "w-full" : "w-auto"}>
                <div
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${
                      isUser
                        ? "rounded-br-md bg-[#6b4f8a] text-white"
                        : "rounded-bl-md border border-[#e2ddd4] bg-[#f8f6f2] text-[#4d5666]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* =================================================
            THINKING
        ================================================== */}

        {sending && (
          <div className="astro-thinking flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-[#d8d2c7] bg-[#f8f6f2] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="astro-thinking-ring absolute h-8 w-8 rounded-full border border-[#6b4f8a]/20" />

                  <span className="astro-thinking-om relative text-lg text-[#6b4f8a]">
                    ॐ
                  </span>
                </div>

                <div>
                  <p className="text-xs font-medium text-[#5b426f]">
                    {t.chat.thinkingTitle}
                  </p>

                  <p className="mt-0.5 text-[10px] text-[#8a93a3]">
                    {t.chat.thinkingSubtitle}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          CHAT INPUT AREA
      ====================================================== */}

      <div className="border-t border-[#e8e3da] bg-[#faf9f6]/95 p-4 sm:p-5">
        {/* ===================================================
            COOLDOWN
        ==================================================== */}

        {cooldownRemaining > 0 && (
          <div
            role="timer"
            className="mb-3 rounded-xl border border-[#e4ded4] bg-[#f8f6f1] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[#5b426f]">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />

                  <path
                    d="M12 7V12L15 14"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <span>
                  {language === "hi"
                    ? "अगला प्रश्न पूछने के लिए प्रतीक्षा करें"
                    : "You can ask your next question in"}
                </span>
              </div>

              <span className="text-sm font-semibold tabular-nums text-[#6b4f8a]">
                {minutes}:{seconds}
              </span>
            </div>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#e4ded4]">
              <div
                className="h-full rounded-full bg-[#6b4f8a] transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (cooldownRemaining / CHAT_COOLDOWN_SECONDS) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ===================================================
            PROMPT
        ==================================================== */}

        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={3}
            placeholder={t.chat.placeholder}
            className={`astro-textarea min-h-[78px] flex-1 resize-none rounded-2xl border bg-white px-4 py-3 text-sm leading-6 text-[#303746] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              hasValidationError
                ? "border-rose-400 ring-1 ring-rose-200 focus:border-rose-500"
                : "border-[#d8d2c7] focus:border-[#6b4f8a]"
            }`}
            aria-invalid={hasValidationError}
            aria-describedby={
              hasValidationError ? "chat-validation" : undefined
            }
          />

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend()}
            className="astro-send-button flex h-[78px] w-14 shrink-0 items-center justify-center rounded-2xl bg-[#6b4f8a] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t.chat.send}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M22 2L11 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M22 2L15 22L11 13L2 9L22 2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* ===================================================
            VALIDATION
        ==================================================== */}

        {displayedValidationError && (
          <p
            id="chat-validation"
            role="alert"
            className="mt-2 text-[11px] font-medium text-rose-600"
          >
            {displayedValidationError}
          </p>
        )}

        {/* ===================================================
            FEEDBACK
        ==================================================== */}

        {feedbackMessage && (
          <div className="astro-feedback-buzz mt-4">
            <FeedbackBox
              sessionId={chat.sessionId}
              messageId={feedbackMessage.id}
              question={feedbackMessage.question ?? ""}
              answer={feedbackMessage.content}
              profile={chat.profile}
            />
          </div>
        )}

        {/* ===================================================
            FOOTER
        ==================================================== */}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] leading-4 text-[#9aa1ad]">
            {t.chat.keyboardHint}
          </p>

          <p className="astro-footer-om hidden text-[10px] text-[#aaa39a] sm:block">
            {t.chat.footerOm}
          </p>
        </div>
      </div>
    </section>
  );
}
