import type { AnswerLanguage } from "@/lib/astro-ui";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  language: AnswerLanguage;
};

export default function Hero({ t, language }: Props) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="astro-shanti-badge mb-4 inline-flex items-center gap-2 rounded-full border border-[#6b4f8a]/30 px-4 py-2 text-xs text-[#5b426f]">
          <span className="astro-shanti-om text-base">ॐ</span>

          <span className="whitespace-nowrap">{t.hero.badge}</span>

          <span className="astro-shanti-om text-base">ॐ</span>
        </div>

        <h2 className="astro-hero-title text-3xl font-semibold tracking-tight text-[#303746] sm:text-4xl">
          {language === "en" ? (
            <>
              {t.hero.titlePrefix}{" "}
              <span className="text-[#6b4f8a]">{t.hero.titleAccent}</span>
            </>
          ) : (
            <>
              {t.hero.titlePrefix}{" "}
              <span className="text-[#6b4f8a]">{t.hero.titleAccent}</span>{" "}
              {t.hero.titleSuffix}
            </>
          )}
        </h2>

        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#737d8d] sm:text-base">
          {t.hero.description}
        </p>
      </div>
    </section>
  );
}
