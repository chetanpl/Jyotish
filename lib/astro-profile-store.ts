"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_PROFILE,
  STORAGE_KEY,
  isBirthLocation,
  type BirthProfile,
} from "./astro-ui";

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: BirthProfile = EMPTY_PROFILE;
let initialized = false;

function readProfile(): BirthProfile {
  if (typeof window === "undefined") {
    return EMPTY_PROFILE;
  }

  try {
    const saved =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!saved) {
      return EMPTY_PROFILE;
    }

    const parsed: unknown =
      JSON.parse(saved);

    if (
      typeof parsed !== "object" ||
      parsed === null
    ) {
      return EMPTY_PROFILE;
    }

    const data =
      parsed as Record<string, unknown>;

    return {
      name:
        typeof data.name === "string"
          ? data.name
          : "",

      gender:
        typeof data.gender === "string"
          ? data.gender
          : "",

      dateOfBirth:
        typeof data.dateOfBirth === "string"
          ? data.dateOfBirth
          : "",

      timeOfBirth:
        typeof data.timeOfBirth === "string"
          ? data.timeOfBirth
          : "",

      placeOfBirth: isBirthLocation(
        data.placeOfBirth,
      )
        ? data.placeOfBirth
        : null,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

function getSnapshot(): BirthProfile {
  return snapshot;
}

function getServerSnapshot(): BirthProfile {
  return EMPTY_PROFILE;
}

function subscribe(
  listener: Listener,
): () => void {
  listeners.add(listener);

  if (!initialized) {
    snapshot = readProfile();
    initialized = true;
  }

  function handleStorage(
    event: StorageEvent,
  ): void {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    snapshot = readProfile();

    for (const currentListener of listeners) {
      currentListener();
    }
  }

  window.addEventListener(
    "storage",
    handleStorage,
  );

  return () => {
    listeners.delete(listener);

    window.removeEventListener(
      "storage",
      handleStorage,
    );
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function persistProfile(
  nextProfile: BirthProfile,
): void {
  snapshot = nextProfile;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextProfile),
    );
  } catch {
    // localStorage उपलब्ध न होने पर app चलता रहेगा।
  }

  notify();
}

export function useBirthProfile(): readonly [
  BirthProfile,
  <K extends keyof BirthProfile>(
    key: K,
    value: BirthProfile[K],
  ) => void,
] {
  const profile =
    useSyncExternalStore(
      subscribe,
      getSnapshot,
      getServerSnapshot,
    );

  function updateProfile<
    K extends keyof BirthProfile,
  >(
    key: K,
    value: BirthProfile[K],
  ): void {
    persistProfile({
      ...snapshot,
      [key]: value,
    });
  }

  return [
    profile,
    updateProfile,
  ] as const;
}