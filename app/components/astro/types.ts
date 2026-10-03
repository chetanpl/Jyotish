import type { getUiText } from "@/lib/astro-ui";
import type { useBirthProfile } from "@/lib/astro-profile-store";

export type UiText = ReturnType<typeof getUiText>;

export type BirthProfileState = ReturnType<typeof useBirthProfile>[0];

export type UpdateBirthProfile = ReturnType<typeof useBirthProfile>[1];

export type ProfileChangeHandler = <K extends keyof BirthProfileState>(
  key: K,
  value: BirthProfileState[K],
) => void;
