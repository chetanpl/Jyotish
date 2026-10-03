import type { BirthLocation } from "@/lib/astro-ui";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  location: BirthLocation;
};

const LABEL_CLASS =
  "text-[10px] font-medium uppercase tracking-[0.08em] text-[#a09a90]";

export default function SelectedLocationCard({ t, location }: Props) {
  return (
    <div className="astro-location-card rounded-xl border border-[#e4ded4] bg-[#f8f6f1] p-4">
      <div className="flex items-start gap-3">
        <div className="astro-small-om flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6b4f8a]/10 text-sm text-[#6b4f8a]">
          ॐ
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#4f596a]">
            {t.profile.selectedTitle}
          </p>

          <p className="mt-1 break-words text-xs leading-5 text-[#7c8594]">
            {location.displayName}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
              <p className={LABEL_CLASS}>{t.profile.latitude}</p>

              <p className="mt-1 text-xs font-semibold text-[#596274]">
                {location.latitude.toFixed(6)}
              </p>
            </div>

            <div className="rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
              <p className={LABEL_CLASS}>{t.profile.longitude}</p>

              <p className="mt-1 text-xs font-semibold text-[#596274]">
                {location.longitude.toFixed(6)}
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-[#e2ddd4] bg-white/70 px-3 py-2">
            <p className={LABEL_CLASS}>{t.profile.timezone}</p>

            <p className="mt-1 break-all text-xs font-semibold text-[#596274]">
              {location.timezoneId || location.timezone}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
