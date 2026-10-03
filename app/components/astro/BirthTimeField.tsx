import {
  formatTime12Hour,
  isMeridiem,
  setTimeFrom12Hour,
} from "@/lib/astro-ui";
import type { BirthProfileState, ProfileChangeHandler, UiText } from "./types";

type Props = {
  t: UiText;
  profile: BirthProfileState;
  onProfileChange: ProfileChangeHandler;
};

const SELECT_CLASS =
  "astro-input rounded-xl border border-[#d8d2c7] bg-white px-3 py-3 text-sm font-medium outline-none";

const HOURS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);

const MINUTES = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

export default function BirthTimeField({ t, profile, onProfileChange }: Props) {
  const timeParts = formatTime12Hour(profile.timeOfBirth);

  return (
    <div className="astro-field">
      <label className="mb-2 block text-xs font-medium text-[#4f596a]">
        {t.profile.timeOfBirth}
      </label>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <select
          value={timeParts.hour}
          onChange={(event) => {
            const value = event.target.value;

            if (!/^\d{2}$/.test(value)) {
              return;
            }

            onProfileChange(
              "timeOfBirth",
              setTimeFrom12Hour(value, timeParts.minute, timeParts.period),
            );
          }}
          aria-label={t.profile.hour}
          className={SELECT_CLASS}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>

        <select
          value={timeParts.minute}
          onChange={(event) => {
            const value = event.target.value;

            if (!/^\d{2}$/.test(value)) {
              return;
            }

            onProfileChange(
              "timeOfBirth",
              setTimeFrom12Hour(timeParts.hour, value, timeParts.period),
            );
          }}
          aria-label={t.profile.minute}
          className={SELECT_CLASS}
        >
          {MINUTES.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>

        <select
          value={timeParts.period}
          onChange={(event) => {
            const value = event.target.value;

            if (!isMeridiem(value)) {
              return;
            }

            onProfileChange(
              "timeOfBirth",
              setTimeFrom12Hour(timeParts.hour, timeParts.minute, value),
            );
          }}
          aria-label={t.profile.period}
          className={SELECT_CLASS}
        >
          <option value="AM">{t.profile.am}</option>

          <option value="PM">{t.profile.pm}</option>
        </select>
      </div>

      <p className="mt-2 text-[10px] text-[#98a0ad]">{t.profile.timeHelper}</p>
    </div>
  );
}
