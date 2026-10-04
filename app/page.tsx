"use client";

import { useState } from "react";

import {
  getUiText,
  isAnswerLanguage,
  type AnswerLanguage,
} from "@/lib/astro-ui";

import { useBirthProfile } from "@/lib/astro-profile-store";
import { ASTRO_MUSIC_ENABLED } from "@/lib/astro-client-config";

import { useAstroChat } from "./hooks/useAstroChat";
import { useBackgroundMusic } from "./hooks//useBackgroundMusic";
import { useLocationSearch } from "./hooks/useLocationSearch";

import ChatPanel from "./components/astro/ChatPanel";
import Footer from "./components/astro/Footer";
import Header from "./components/astro/Header";
import Hero from "./components/astro/Hero";
import LocationSuggestionsPopup from "./components/astro/LocationSuggestionsPopup";
import ProfilePanel from "./components/astro/ProfilePanel";

import type { ProfileChangeHandler } from "./components/astro/types";

export default function Home() {
  const [profile, updateProfile] = useBirthProfile();

  const [language, setLanguage] =
    useState<AnswerLanguage>("hi");

  const t = getUiText(language);

  const chat = useAstroChat({
    profile,
    language,
    t,
  });

  const location = useLocationSearch({
    profile,
    updateProfile,
    onInteraction: chat.clearValidation,
  });

  const {
    musicRef,
    musicPlaying,
    handleMusicToggle,
  } = useBackgroundMusic();

  const handleProfileChange: ProfileChangeHandler = (
    key,
    value,
  ) => {
    updateProfile(key, value);

    chat.clearValidation();
  };

  function handleLanguageChange(
    next: AnswerLanguage,
  ): void {
    if (isAnswerLanguage(next)) {
      setLanguage(next);

      chat.clearValidation();
    }
  }

  return (
    <>
      <main className="astro-page min-h-screen overflow-hidden text-[#273142]">
        <div
          className="astro-background"
          aria-hidden="true"
        >
          <div className="astro-bg-orb astro-bg-orb-one" />
          <div className="astro-bg-orb astro-bg-orb-two" />
          <div className="astro-bg-orb astro-bg-orb-three" />
        </div>

        <div className="relative z-10">
          <Header
            t={t}
            language={language}
            musicPlaying={musicPlaying}
            onMusicToggle={handleMusicToggle}
          />

          {ASTRO_MUSIC_ENABLED && (
            <audio
              ref={musicRef}
              src="/audio/om.mp3"
              preload="auto"
              aria-hidden="true"
            />
          )}

          <Hero
            t={t}
            language={language}
          />

          <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 sm:px-8 lg:grid-cols-[380px_minmax(0,1fr)]">
            <ProfilePanel
              t={t}
              language={language}
              sending={chat.sending}
              profile={profile}
              onProfileChange={handleProfileChange}
              onLanguageChange={handleLanguageChange}
              location={location}
            />

            <ChatPanel
              t={t}
              language={language}
              chat={chat}
            />
          </section>

          <Footer
            t={t}
            language={language}
            provider={chat.provider}
            model={chat.model}
          />
        </div>
      </main>

      <LocationSuggestionsPopup
        t={t}
        suggestions={location.suggestions}
        position={location.locationPopupPosition}
        onSelect={(suggestion) =>
          void location.selectLocation(suggestion)
        }
      />
    </>
  );
}