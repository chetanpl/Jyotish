import { ASTRO_MUSIC_ENABLED } from "@/lib/astro-client-config";
import type { AnswerLanguage } from "@/lib/astro-ui";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  language: AnswerLanguage;
  musicPlaying: boolean;
  onMusicToggle: () => void;
};

function MusicIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 18V5L21 3V16"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function Header({
  t,
  language,
  musicPlaying,
  onMusicToggle,
}: Props) {
  const musicLabel = musicPlaying
    ? language === "hi"
      ? "संगीत बंद करें"
      : "Turn music off"
    : language === "hi"
      ? "संगीत चालू करें"
      : "Turn music on";

  return (
    <header className="astro-header border-b border-[#e7e2d9]/80 bg-[#faf9f6]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="astro-logo flex h-11 w-11 items-center justify-center rounded-xl bg-[#6b4f8a] text-xl text-white shadow-sm">
            ॐ
          </div>

          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[#303746]">
              Daivik AI
            </h1>

            <p className="text-[11px] text-[#8a93a3]">{t.header.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center">
          {ASTRO_MUSIC_ENABLED && (
            <button
              type="button"
              onClick={onMusicToggle}
              className={`mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
                musicPlaying
                  ? "border-[#6b4f8a]/30 bg-[#6b4f8a]/10 text-[#6b4f8a]"
                  : "border-[#ddd7cd] bg-white text-[#8a93a3] hover:border-[#6b4f8a]/30 hover:text-[#6b4f8a]"
              }`}
              aria-label={musicLabel}
              title={musicLabel}
              aria-pressed={musicPlaying}
            >
              {musicPlaying ? (
                <MusicIcon />
              ) : (
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <MusicIcon />

                  <span
                    className="absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current"
                    aria-hidden="true"
                  />
                </span>
              )}
            </button>
          )}

          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium text-[#5c6575]">
              {t.header.metaTitle}
            </p>

            <p className="text-[10px] text-[#9aa1ad]">
              {t.header.metaDescription}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
