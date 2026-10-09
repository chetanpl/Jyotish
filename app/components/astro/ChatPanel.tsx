"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  CHAT_COOLDOWN_SECONDS,
  type useAstroChat,
} from "../../hooks/useAstroChat";

import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";

import type { UiText } from "./types";
import type { AnswerLanguage } from "@/lib/astro-ui";

import FeedbackBox from "./FeedbackBox";

/* ====================== 3D VOICE WAVE ====================== */

const WAVE_BAR_COUNT = 33; // odd number: ek bar bilkul beech mein

const WAVE_CSS = `
.astro-wave {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid #e3d9ed;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f6f1fb 100%);
  box-shadow: 0 6px 18px rgba(107, 79, 138, 0.1);
}
.astro-wave-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e5484d;
  box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.55);
  animation: astro-wave-pulse 1.4s ease-out infinite;
}
.astro-wave-label {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: #5b426f;
}
.astro-wave-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 420px;
}
.astro-wave-bars {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  transform: rotateX(18deg);
  transform-style: preserve-3d;
}
.astro-wave-bar {
  position: relative;
  flex: none;
  width: 5px;
  min-height: 5px;
  border-radius: 999px;
  background: linear-gradient(180deg, #c4a9ec 0%, #8a63b8 40%, #6b4f8a 65%, #3f2a5c 100%);
  box-shadow:
    inset 1.5px 0 0 rgba(255, 255, 255, 0.55),
    inset -1.5px 0 0 rgba(30, 10, 60, 0.35),
    0 5px 10px rgba(107, 79, 138, 0.35);
  transform: translateZ(0);
  transition: height 90ms ease-out, box-shadow 120ms ease-out, filter 120ms ease-out;
  will-change: height;
}
.astro-wave-bar::before {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 2px;
  height: 30%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
}
.astro-wave-bar.is-hot {
  filter: brightness(1.15) saturate(1.2);
  box-shadow:
    inset 1.5px 0 0 rgba(255, 255, 255, 0.65),
    inset -1.5px 0 0 rgba(30, 10, 60, 0.35),
    0 0 12px rgba(160, 110, 230, 0.7),
    0 5px 10px rgba(107, 79, 138, 0.35);
}
.astro-wave-floor {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -2px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(107, 79, 138, 0.28), transparent 70%);
  filter: blur(3px);
  pointer-events: none;
}
.astro-wave.is-idle .astro-wave-bar {
  animation: astro-wave-idle 1.1s ease-in-out infinite;
  animation-delay: calc(var(--i) * -55ms);
}
@keyframes astro-wave-idle {
  0%, 100% { height: 14%; }
  50% { height: var(--idle, 55%); }
}
@keyframes astro-wave-pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.55); }
  100% { box-shadow: 0 0 0 9px rgba(229, 72, 77, 0); }
}
@media (max-width: 480px) {
  .astro-wave-bar { width: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .astro-wave-dot,
  .astro-wave.is-idle .astro-wave-bar { animation: none; }
  .astro-wave-bar { transition: none; }
}
`;

type VoiceWaveProps = {
  levels: number[];
  label: string;
};

/**
 * levels 0..1 ya 0..255 dono chalenge (1 se bada ho to 255 maana jata hai).
 * Levels khaali ho ya bahut kam hon, tab bhi wave idle animation se zinda dikhti hai.
 */
function VoiceWave({ levels, label }: VoiceWaveProps) {
  const safeLevels = levels.filter((v) => Number.isFinite(v) && v >= 0);
  const rawMax = safeLevels.length ? Math.max(...safeLevels) : 0;
  const divisor = rawMax > 1 ? 255 : 1;

  const normalized = safeLevels.map((v) => Math.min(1, v / divisor));
  const peak = normalized.length ? Math.max(...normalized) : 0;
  const idle = peak < 0.03;

  const half = (WAVE_BAR_COUNT - 1) / 2;

  const bars = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
    const distance = Math.abs(i - half) / half; // 0 = beech, 1 = kinara
    let lvl = 0.1;

    if (normalized.length > 0) {
      const src = Math.min(
        normalized.length - 1,
        Math.floor(distance * (normalized.length - 1) * 0.85),
      );
      const boosted = Math.pow(normalized[src], 0.6) * 1.35;
      const taper = 1 - distance * 0.4;
      lvl = Math.max(0.1, Math.min(1, boosted * taper));
    }

    return { i, lvl, distance };
  });

  return (
    <div
      role="status"
      aria-label={label}
      className={`astro-wave ${idle ? "is-idle" : ""}`}
    >
      <span className="astro-wave-dot" aria-hidden="true" />
      <span className="astro-wave-label">{label}</span>

      <div className="astro-wave-stage" aria-hidden="true">
        <div className="astro-wave-bars">
          {bars.map(({ i, lvl, distance }) => (
            <span
              key={i}
              className={`astro-wave-bar ${lvl > 0.7 ? "is-hot" : ""}`}
              style={
                {
                  height: `${Math.round(lvl * 100)}%`,
                  "--i": i,
                  "--idle": `${Math.round(38 + (1 - distance) * 52)}%`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="astro-wave-floor" />
      </div>
    </div>
  );
}

/* ====================== SPEAK (TEXT-TO-SPEECH) ====================== */

type SpeechLang = "hi-IN" | "en-IN";

// Markdown, links, emoji hatao taaki awaaz saaf aaye
function cleanForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#`~>|]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\u200d\ufe0f]/g, "")
    .replace(/([.!?।॥:;,])\s*\n+\s*/g, "$1 ")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hardSplit(text: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    if (current && `${current} ${word}`.length > max) {
      parts.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) parts.push(current);
  return parts;
}

// Chrome lambi utterance beech mein rok deta hai, isliye chhote tukde
function splitForSpeech(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?।॥]+[.!?।॥]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;

    if (current && `${current} ${part}`.length > max) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }

  if (current) chunks.push(current);

  return chunks.flatMap((chunk) =>
    chunk.length > max * 1.6 ? hardSplit(chunk, max) : [chunk],
  );
}

function detectSpeechLang(text: string, fallback: SpeechLang): SpeechLang {
  const devanagari = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;

  if (devanagari === 0 && latin === 0) return fallback;
  return devanagari >= latin ? "hi-IN" : "en-IN";
}

function pickVoice(lang: SpeechLang): SpeechVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const normalize = (value: string) => value.replace("_", "-").toLowerCase();
  const prefix = lang.slice(0, 2);

  return (
    voices.find((v) => normalize(v.lang) === normalize(lang)) ??
    voices.find((v) => normalize(v.lang).startsWith(prefix)) ??
    null
  );
}

type SpeechVoice = SpeechSynthesisVoice;

const SPEAK_CSS = `
.astro-speak {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 7px 16px 7px 8px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  background: linear-gradient(135deg, #9a72c9 0%, #6b4f8a 55%, #4d3470 100%);
  box-shadow:
    0 6px 16px rgba(107, 79, 138, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.25s ease;
}
.astro-speak::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.5) 50%, transparent 65%);
  background-size: 250% 100%;
  background-position: 150% 0;
}
.astro-speak:hover {
  transform: translateY(-1px) scale(1.03);
  box-shadow:
    0 10px 22px rgba(107, 79, 138, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.astro-speak:active { transform: scale(0.96); }
.astro-speak:focus-visible { outline: 2px solid #60a5fa; outline-offset: 3px; }

.astro-speak-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.astro-speak-icon svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.astro-speak-wave1,
.astro-speak-wave2 { opacity: 0.4; }

/* Sabse naye jawab par: dhyan kheechne wali animation */
.astro-speak.is-attention { animation: astro-speak-bob 3.2s ease-in-out infinite; }
.astro-speak.is-attention::before {
  content: "";
  position: absolute;
  inset: -3px;
  z-index: -1;
  border-radius: inherit;
  border: 2px solid rgba(154, 114, 201, 0.8);
  pointer-events: none;
  animation: astro-speak-ring 1.9s ease-out infinite;
}
.astro-speak.is-attention::after { animation: astro-speak-shimmer 2.6s ease-in-out infinite; }
.astro-speak.is-attention .astro-speak-wave1 { animation: astro-speak-wave 1.2s ease-in-out infinite; }
.astro-speak.is-attention .astro-speak-wave2 { animation: astro-speak-wave 1.2s ease-in-out 0.25s infinite; }

/* Bol raha hai: red Stop button + equalizer */
.astro-speak.is-speaking {
  background: linear-gradient(135deg, #f06a6f 0%, #dc2626 55%, #b91c1c 100%);
  box-shadow:
    0 6px 16px rgba(220, 38, 38, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.astro-speak.is-speaking::before {
  content: "";
  position: absolute;
  inset: -3px;
  z-index: -1;
  border-radius: inherit;
  border: 2px solid rgba(220, 38, 38, 0.65);
  pointer-events: none;
  animation: astro-speak-ring 1.4s ease-out infinite;
}
.astro-speak-eq {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 14px;
}
.astro-speak-eq span {
  width: 2.5px;
  height: 100%;
  border-radius: 2px;
  background: #fff;
  animation: astro-speak-eq 0.9s ease-in-out infinite;
}
.astro-speak-eq span:nth-child(2) { animation-delay: -0.3s; }
.astro-speak-eq span:nth-child(3) { animation-delay: -0.6s; }
.astro-speak-eq span:nth-child(4) { animation-delay: -0.15s; }

@keyframes astro-speak-ring {
  0% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(1.18, 1.7); opacity: 0; }
}
@keyframes astro-speak-bob {
  0%, 70%, 100% { transform: translateY(0) scale(1); }
  80% { transform: translateY(-3px) scale(1.05); }
  90% { transform: translateY(0) scale(1); }
}
@keyframes astro-speak-shimmer {
  0% { background-position: 150% 0; }
  60%, 100% { background-position: -50% 0; }
}
@keyframes astro-speak-wave {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}
@keyframes astro-speak-eq {
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
}
@media (prefers-reduced-motion: reduce) {
  .astro-speak,
  .astro-speak::before,
  .astro-speak::after,
  .astro-speak-wave1,
  .astro-speak-wave2,
  .astro-speak-eq span { animation: none !important; }
}
`;

/* ====================== MIC BUTTON (eye-catching) ====================== */

const MIC_CSS = `
.astro-chat .astro-mic-button {
  position: relative;
  isolation: isolate;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #9a72c9 0%, #6b4f8a 55%, #4d3470 100%);
  box-shadow:
    0 6px 16px rgba(107, 79, 138, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  animation: none;
  transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.25s ease;
}
.astro-chat .astro-mic-button svg {
  width: 22px;
  height: 22px;
  stroke-width: 2;
  animation: astro-mic-wiggle 3.6s ease-in-out infinite;
}

/* bahar failti ring: user ki nazar khichti hai */
.astro-chat .astro-mic-button::before {
  content: "";
  position: absolute;
  inset: -3px;
  z-index: -1;
  border-radius: 50%;
  border: 2px solid rgba(154, 114, 201, 0.85);
  pointer-events: none;
  animation: astro-mic-ring 2s ease-out infinite;
}

/* upar se guzarti chamak */
.astro-chat .astro-mic-button::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.55) 50%, transparent 65%);
  background-size: 250% 100%;
  background-position: 150% 0;
  animation: astro-mic-shimmer 2.8s ease-in-out infinite;
}

.astro-chat .astro-mic-button:hover:not(:disabled) {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #a67fd6 0%, #7a5a9c 55%, #573a7c 100%);
  box-shadow:
    0 10px 22px rgba(107, 79, 138, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
  transform: translateY(-1px) scale(1.08);
}
.astro-chat .astro-mic-button:active:not(:disabled) { transform: scale(0.94); }

/* Recording: laal, tez ripple, stop square bhara hua */
.astro-chat .astro-mic-button.is-recording {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, #f06a6f 0%, #dc2626 55%, #b91c1c 100%);
  box-shadow:
    0 6px 18px rgba(220, 38, 38, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  animation: none;
}
.astro-chat .astro-mic-button.is-recording svg { animation: none; }
.astro-chat .astro-mic-button.is-recording svg rect { fill: currentColor; }
.astro-chat .astro-mic-button.is-recording::before {
  border-color: rgba(220, 38, 38, 0.75);
  animation: astro-mic-ring 1.3s ease-out infinite;
}
.astro-chat .astro-mic-button.is-recording::after {
  inset: -3px;
  z-index: -1;
  background: none;
  border: 2px solid rgba(220, 38, 38, 0.6);
  animation: astro-mic-ring 1.3s ease-out 0.55s infinite;
}
.astro-chat .astro-mic-button.is-recording:hover:not(:disabled) {
  background: linear-gradient(135deg, #f27a7e 0%, #e03131 55%, #c42020 100%);
}

/* Disabled: shaant, koi animation nahi */
.astro-chat .astro-mic-button:disabled {
  opacity: 0.45;
  filter: grayscale(0.4);
  box-shadow: none;
}
.astro-chat .astro-mic-button:disabled::before,
.astro-chat .astro-mic-button:disabled::after { display: none; }
.astro-chat .astro-mic-button:disabled svg { animation: none; }

@keyframes astro-mic-ring {
  0% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes astro-mic-shimmer {
  0% { background-position: 150% 0; }
  60%, 100% { background-position: -50% 0; }
}
@keyframes astro-mic-wiggle {
  0%, 78%, 100% { transform: rotate(0deg) scale(1); }
  82% { transform: rotate(-14deg) scale(1.12); }
  88% { transform: rotate(12deg) scale(1.12); }
  94% { transform: rotate(-6deg) scale(1.05); }
}
@media (prefers-reduced-motion: reduce) {
  .astro-chat .astro-mic-button,
  .astro-chat .astro-mic-button::before,
  .astro-chat .astro-mic-button::after,
  .astro-chat .astro-mic-button svg { animation: none !important; }
}
`;

type SpeakButtonProps = {
  speaking: boolean;
  attention: boolean;
  idleLabel: string;
  stopLabel: string;
  onClick: () => void;
};

function SpeakButton({
  speaking,
  attention,
  idleLabel,
  stopLabel,
  onClick,
}: SpeakButtonProps) {
  const label = speaking ? stopLabel : idleLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={speaking}
      aria-label={label}
      title={label}
      className={`astro-speak ${speaking ? "is-speaking" : ""} ${
        attention && !speaking ? "is-attention" : ""
      }`}
    >
      <span className="astro-speak-icon" aria-hidden="true">
        {speaking ? (
          <span className="astro-speak-eq">
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            <path className="astro-speak-wave1" d="M15.5 9.5a4 4 0 0 1 0 5" />
            <path className="astro-speak-wave2" d="M18.5 7a8 8 0 0 1 0 10" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ====================== CHAT PANEL ====================== */

type Props = {
  t: UiText;
  language: AnswerLanguage;
  chat: ReturnType<typeof useAstroChat>;
};

export default function ChatPanel({
  t,
  language,
  chat,
}: Props) {
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

  const isHindi = language === "hi";

  const [showVoicePreview, setShowVoicePreview] = useState(false);

  const previousTranscriptRef = useRef("");
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  /* ---------- Speak (text-to-speech) ---------- */

  const canSpeak =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speechSessionRef = useRef(0);

  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  const stopSpeaking = useCallback((): void => {
    speechSessionRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeakingId(null);
  }, []);

  const speakMessage = useCallback(
    (id: string, rawText: string): void => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      // Same button dobara dabane par band
      if (speakingId === id) {
        stopSpeaking();
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel();

      const session = ++speechSessionRef.current;
      const chunks = splitForSpeech(cleanForSpeech(rawText));

      if (chunks.length === 0) {
        setSpeakingId(null);
        return;
      }

      const lang = detectSpeechLang(rawText, isHindi ? "hi-IN" : "en-IN");
      const voice = pickVoice(lang);

      setSpeakingId(id);

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);

        utterance.lang = lang;
        if (voice) utterance.voice = voice;
        utterance.rate = lang === "hi-IN" ? 0.95 : 1;
        utterance.pitch = 1;

        utterance.onend = () => {
          if (
            session === speechSessionRef.current &&
            index === chunks.length - 1
          ) {
            setSpeakingId(null);
          }
        };

        utterance.onerror = () => {
          if (session === speechSessionRef.current) {
            setSpeakingId(null);
          }
        };

        synth.speak(utterance);
      });
    },
    [speakingId, stopSpeaking, isHindi],
  );

  // Page chhodte waqt awaaz band
  useEffect(() => {
    return () => {
      speechSessionRef.current += 1;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const {
    transcript,
    error: voiceError,
    audioLevels,
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    cancel: cancelVoice,
  } = useVoiceRecorder({
    onTranscription: (text: string): void => {
      const cleanText = text.trim();

      if (!cleanText) {
        return;
      }

      previousTranscriptRef.current = cleanText;

      const currentInput = inputRef.current.trim();
      const updatedInput = currentInput
        ? `${currentInput} ${cleanText}`
        : cleanText;

      inputRef.current = updatedInput;
      handleInputChange(updatedInput);
      setShowVoicePreview(true);
    },
  });

  const minutes = String(
    Math.floor(cooldownRemaining / 60),
  ).padStart(2, "0");

  const seconds = String(
    cooldownRemaining % 60,
  ).padStart(2, "0");

  const displayedValidationError =
    inputValidationError ?? validationText;

  const hasValidationError =
    displayedValidationError !== null;

  const feedbackMessage =
    feedbackMessageId === null
      ? null
      : messages.find(
          (message) =>
            message.id === feedbackMessageId &&
            message.role === "assistant",
        ) ?? null;

  const handleVoiceButton = useCallback((): void => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (isProcessing || sending) {
      return;
    }

    setShowVoicePreview(false);
    previousTranscriptRef.current = "";
    stopSpeaking(); // mic start hote hi jawab ki awaaz band
    void startRecording();
  }, [
    isRecording,
    isProcessing,
    sending,
    startRecording,
    stopRecording,
    stopSpeaking,
  ]);

  const discardVoice = useCallback((): void => {
    cancelVoice();

    const previousTranscript = previousTranscriptRef.current;

    if (previousTranscript) {
      const currentInput = inputRef.current;
      const trimmedInput = currentInput.trimEnd();
      const appendedText = ` ${previousTranscript}`;

      let updatedInput = currentInput;

      if (trimmedInput.endsWith(appendedText)) {
        updatedInput = trimmedInput
          .slice(0, -appendedText.length)
          .trimEnd();
      } else if (trimmedInput === previousTranscript) {
        updatedInput = "";
      }

      inputRef.current = updatedInput;
      handleInputChange(updatedInput);
    }

    previousTranscriptRef.current = "";
    setShowVoicePreview(false);
  }, [cancelVoice, handleInputChange]);

  return (
    <section className="astro-chat flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-[#e3ded5]/90 bg-white/95 shadow-[0_8px_30px_rgba(67,53,34,0.07)] backdrop-blur-sm">
      <style>{WAVE_CSS + SPEAK_CSS + MIC_CSS}</style>

      {/* Header */}
      <div className="border-b border-[#e8e3da] bg-[#faf9f6]/95 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div
            className="astro-chat-om relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#6b4f8a] text-lg text-white"
            aria-hidden="true"
          >
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

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
        {messages.length === 0 && (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="max-w-md text-center">
              <div
                className="astro-welcome-om mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6b4f8a]/10 text-3xl text-[#6b4f8a]"
                aria-hidden="true"
              >
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
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${
                      isUser
                        ? "rounded-br-md bg-[#6b4f8a] text-white"
                        : "rounded-bl-md border border-[#e2ddd4] bg-[#f8f6f2] text-[#4d5666]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">
                      {message.content}
                    </div>

                    {isAssistant && canSpeak && (
                      <SpeakButton
                        speaking={speakingId === message.id}
                        attention={message.id === lastAssistantId}
                        idleLabel={isHindi ? "जवाब सुनें" : "Listen to answer"}
                        stopLabel={isHindi ? "रोकें" : "Stop"}
                        onClick={() =>
                          speakMessage(message.id, message.content)
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Thinking */}
        {sending && (
          <div className="astro-thinking flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-[#d8d2c7] bg-[#f8f6f2] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="astro-thinking-ring absolute h-8 w-8 rounded-full border border-[#6b4f8a]/20" />

                  <span
                    className="astro-thinking-om relative text-lg text-[#6b4f8a]"
                    aria-hidden="true"
                  >
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

      {/* Input area */}
      <div className="border-t border-[#e8e3da] bg-[#faf9f6]/95 p-4 sm:p-5">
        {/* Cooldown */}
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

                <span>{t.chat.cooldownLabel}</span>
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

        {/* Recording indicator: 3D voice wave */}
        {isRecording && (
          <VoiceWave levels={audioLevels} label={t.voice.listening} />
        )}

        {/* Transcription processing */}
        {isProcessing && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 text-xs text-[#8a93a3]"
          >
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-[#9ca3af]/30 border-t-[#9ca3af]"
              aria-hidden="true"
            />

            {t.voice.transcribing}
          </div>
        )}

        {/* Voice error */}
        {voiceError && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
          >
            {voiceError}

            <p className="mt-1">{t.voice.micHelp}</p>
          </div>
        )}

        {/* Voice preview */}
        {showVoicePreview && transcript && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-[#e3d9ed] bg-white px-3 py-2">
            <p className="min-w-0 flex-1 break-words text-xs leading-5 text-[#5b426f]">
              {transcript}
            </p>

            <button
              type="button"
              onClick={discardVoice}
              aria-label={
                isHindi ? "वॉइस टेक्स्ट हटाएँ" : "Discard voice transcription"
              }
              title={isHindi ? "टेक्स्ट हटाएँ" : "Discard transcription"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8a93a3] hover:bg-rose-50 hover:text-rose-600"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Text input and actions */}
        <div className="flex items-center gap-2">
          <textarea
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || isRecording || isProcessing}
            rows={3}
            placeholder={
              isRecording ? t.voice.tapToStop : t.chat.placeholder
            }
            className={`astro-textarea min-h-[78px] min-w-0 flex-1 resize-none rounded-2xl border bg-white px-4 py-3 text-sm leading-6 text-[#303746] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              hasValidationError
                ? "border-rose-400 ring-1 ring-rose-200 focus:border-rose-500"
                : "border-[#d8d2c7] focus:border-[#6b4f8a]"
            }`}
            aria-label={t.chat.inputLabel}
            aria-invalid={hasValidationError}
            aria-describedby={
              hasValidationError ? "chat-validation" : undefined
            }
          />

          {/* Microphone */}
          <button
            type="button"
            onClick={handleVoiceButton}
            disabled={sending || isProcessing}
            aria-label={isRecording ? t.voice.stop : t.voice.start}
            title={isRecording ? t.voice.stop : t.voice.start}
            className={`astro-mic-button ${
              isRecording ? "is-recording" : ""
            }`}
          >
            {isRecording ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="7" width="10" height="10" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3M9 21h6" />
              </svg>
            )}
          </button>

          {/* Send */}
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend() || isRecording || isProcessing}
            className="astro-send-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6b4f8a] text-white transition-colors hover:bg-[#58406f] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t.chat.send}
            title={t.chat.sendTitle}
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

        {/* Cancel recording */}
        {isRecording && (
          <button
            type="button"
            onClick={discardVoice}
            className="mt-2 text-xs font-medium text-rose-600 hover:underline"
          >
            {t.voice.cancel}
          </button>
        )}

        {/* Validation */}
        {displayedValidationError && (
          <p
            id="chat-validation"
            role="alert"
            className="mt-2 text-[11px] font-medium text-rose-600"
          >
            {displayedValidationError}
          </p>
        )}

        {/* Feedback */}
        {feedbackMessage && (
          <div className="astro-feedback-buzz mt-4">
            <FeedbackBox
              t={t}
              sessionId={chat.sessionId}
              messageId={feedbackMessage.id}
              question={feedbackMessage.question ?? ""}
              answer={feedbackMessage.content}
              profile={chat.profile}
            />
          </div>
        )}

        {/* Footer */}
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