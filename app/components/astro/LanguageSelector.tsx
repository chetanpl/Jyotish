import type { AnswerLanguage } from "@/lib/astro-ui";

type Props = {
  language: AnswerLanguage;
  disabled: boolean;
  onChange: (language: AnswerLanguage) => void;
};

const OPTIONS: { value: AnswerLanguage; label: string; sub: string }[] = [
  { value: "hi", label: "हिंदी", sub: "Hindi" },
  { value: "en", label: "English", sub: "English" },
];

export default function LanguageSelector({
  language,
  disabled,
  onChange,
}: Props) {
  const title = language === "hi" ? "परिणाम की भाषा" : "Result Language";

  return (
    <div className="astro-field">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor="answerLanguage"
          className="block text-xs font-medium text-[#4f596a]"
        >
          {title}
        </label>

        <span className="text-[10px] text-[#9aa1ad]">
          {language === "hi" ? "भाषा चुनें" : "Choose language"}
        </span>
      </div>

      <div
        id="answerLanguage"
        role="group"
        aria-label={title}
        className="grid grid-cols-2 gap-1 rounded-xl border border-[#d8d2c7] bg-[#f5f2ed] p-1"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            aria-pressed={language === option.value}
            className={`rounded-lg px-3 py-3 text-sm font-medium transition-all ${
              language === option.value
                ? "bg-white text-[#6b4f8a] shadow-sm ring-1 ring-[#6b4f8a]/10"
                : "text-[#737d8d] hover:bg-white/70 hover:text-[#4f596a]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span className="block">{option.label}</span>

            <span className="mt-0.5 block text-[10px] font-normal opacity-70">
              {option.sub}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-4 text-[#98a0ad]">
        {language === "hi"
          ? "आप ज्योतिषीय परिणाम हिंदी या अंग्रेज़ी में प्राप्त कर सकते हैं।"
          : "Choose whether your astrology results should be in English or Hindi."}
      </p>
    </div>
  );
}
