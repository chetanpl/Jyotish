import type { AnswerLanguage } from "@/lib/astro-ui";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  language: AnswerLanguage;
  provider?: "gemini" | "groq";
  model?: string;
};

export default function Footer({
  t,
  language,
  provider,
  model,
}: Props) {
  const providerName =
    provider === "gemini"
      ? "Google"
      : provider === "groq"
        ? "Groq"
        : "";

  return (
    <footer className="border-t border-[#ddd7cd] bg-[#f7f4ee]">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          {/* Description + Disclaimer */}
          <div className="text-center lg:text-left">
            <p className="text-xs font-medium leading-5 text-[#596273]">
              {t.footer.description}
            </p>

            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#737d8d]">
              <span className="font-semibold text-[#565f70]">
                {language === "hi" ? "अस्वीकरण:" : "Disclaimer:"}
              </span>{" "}
              {t.footer.disclaimer}
            </p>
          </div>

          {/* Footer Brand + Actual AI Model */}
          <div className="flex flex-col items-center justify-center border-t border-[#ddd7cd] pt-4 lg:min-w-[240px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="astro-footer-om text-sm font-medium text-[#6b4f8a]">
              {t.footer.right}
            </p>

            <p className="mt-2 text-sm font-bold tracking-wide text-[#4f596a]">
              {t.footer.poweredBy}
            </p>

            {model && (
              <p className="mt-1 text-[10px] font-medium tracking-wide text-[#8a93a1]">
                AI: {providerName && `${providerName} · `}
                {model}
              </p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}