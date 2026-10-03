const POINTS = [
  "No unnecessary personal data storage",
  "Encrypted data transmission",
  "Your privacy is our priority",
];

export default function PrivacyNotice() {
  return (
    <div className="mt-5 rounded-xl border border-[#e3ded5] bg-[#f8f6f1] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 3L19 6V11C19 15.5 16.1 19.5 12 21C7.9 19.5 5 15.5 5 11V6L12 3Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d="M9 12L11 14L15 10"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#4f596a]">
            Your Privacy Matters
          </p>

          <p className="mt-1 text-[11px] leading-5 text-[#7c8594]">
            We don’t store your personal information unnecessarily. Your
            information is protected with encryption while it is being
            transmitted.
          </p>

          <div className="mt-3 space-y-1.5">
            {POINTS.map((point) => (
              <div
                key={point}
                className="flex items-center gap-2 text-[10px] text-[#737d8d]"
              >
                <span className="text-emerald-600">✓</span>

                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
