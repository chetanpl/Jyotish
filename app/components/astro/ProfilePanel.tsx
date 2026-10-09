"use client";

import { useState } from "react";
import type { AnswerLanguage } from "@/lib/astro-ui";
import type { useLocationSearch } from "@/hooks/useLocationSearch";
import BirthTimeField from "./BirthTimeField";
import LanguageSelector from "./LanguageSelector";
import LocationField from "./LocationField";
import PrivacyNotice from "./PrivacyNotice";
import SelectedLocationCard from "./SelectedLocationCard";
import type { BirthProfileState, ProfileChangeHandler, UiText } from "./types";

type Props = {
  t: UiText;
  language: AnswerLanguage;
  sending: boolean;
  profile: BirthProfileState;
  onProfileChange: ProfileChangeHandler;
  onLanguageChange: (language: AnswerLanguage) => void;
  location: ReturnType<typeof useLocationSearch>;
};

const INPUT_CLASS =
  "astro-input w-full rounded-xl border border-[#d8d2c7] bg-white px-4 py-3 text-sm outline-none";

const LABEL_CLASS = "mb-2 block text-xs font-medium text-[#4f596a]";

export default function ProfilePanel({
  t,
  language,
  sending,
  profile,
  onProfileChange,
  onLanguageChange,
  location,
}: Props) {
  const [showProfile, setShowProfile] = useState(true);

  const selectedLocation = profile.placeOfBirth;

  const handleClearForm = () => {
    if (sending) return;

    onProfileChange("name", "");
    onProfileChange("gender", "");
    onProfileChange("dateOfBirth", "");
    onProfileChange("placeOfBirth", null);
    
    // Clear the birth time using the empty value supported by your profile type.
    onProfileChange("timeOfBirth", "");
  };

  return (
    <aside className="astro-card rounded-2xl border border-[#e3ded5]/90 bg-[#faf9f6]/95 p-6 shadow-[0_8px_30px_rgba(67,53,34,0.07)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a8b78]">
            {t.profile.eyebrow}
          </p>

          <h3 className="mt-1 text-lg font-semibold text-[#303746]">
            {t.profile.title}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setShowProfile((current) => !current)}
          className="astro-button rounded-lg border border-[#ddd7cd] bg-white px-3 py-2 text-xs font-medium text-[#606979]"
          aria-expanded={showProfile}
        >
          {showProfile ? t.profile.hide : t.profile.show}
        </button>
      </div>

      {showProfile && (
        <div className="astro-profile-form mt-6 space-y-5">
          {/* Name */}
          <div className="astro-field">
            <label htmlFor="name" className={LABEL_CLASS}>
              {t.profile.name}
            </label>

            <input
              id="name"
              type="text"
              value={profile.name}
              disabled={sending}
              onChange={(event) =>
                onProfileChange("name", event.target.value)
              }
              placeholder={t.profile.namePlaceholder}
              className={INPUT_CLASS}
            />
          </div>

          {/* Gender */}
          <div className="astro-field">
            <label htmlFor="gender" className={LABEL_CLASS}>
              {t.profile.gender}
            </label>

            <select
              id="gender"
              value={profile.gender}
              disabled={sending}
              onChange={(event) =>
                onProfileChange("gender", event.target.value)
              }
              className={INPUT_CLASS}
            >
              <option value="">{t.profile.genderPlaceholder}</option>
              <option value="male">{t.profile.male}</option>
              <option value="female">{t.profile.female}</option>
              <option value="other">{t.profile.other}</option>
            </select>
          </div>

          {/* Result language */}
          <LanguageSelector
            language={language}
            disabled={sending}
            onChange={onLanguageChange}
          />

          {/* Date */}
          <div className="astro-field">
            <label htmlFor="dateOfBirth" className={LABEL_CLASS}>
              {t.profile.dateOfBirth}
            </label>

            <input
              id="dateOfBirth"
              type="date"
              value={profile.dateOfBirth}
              disabled={sending}
              onChange={(event) =>
                onProfileChange("dateOfBirth", event.target.value)
              }
              className={INPUT_CLASS}
            />
          </div>

          {/* Time */}
          <BirthTimeField
            t={t}
            profile={profile}
            onProfileChange={onProfileChange}
          />

          {/* Place */}
          <LocationField
            t={t}
            inputRef={location.locationInputRef}
            value={location.locationValue}
            loading={location.locationLoading}
            selected={location.locationSelected}
            error={location.locationError}
            hasSuggestions={location.suggestions.length > 0}
            onChange={location.handleLocationChange}
          />

          {/* Selected location */}
          {selectedLocation && (
            <SelectedLocationCard t={t} location={selectedLocation} />
          )}

          {/* Privacy */}
          <PrivacyNotice />

          {/* Clear entire form */}
          <button
            type="button"
            onClick={handleClearForm}
            disabled={sending}
            className="w-full rounded-xl border border-[#d8b7ad] bg-white px-4 py-3 text-sm font-medium text-[#9b493b] transition hover:bg-[#fbf1ee] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Form
          </button>
        </div>
      )}
    </aside>
  );
}