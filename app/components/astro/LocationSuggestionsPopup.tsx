import { createPortal } from "react-dom";
import type { LocationSuggestion } from "@/lib/astro-ui";
import type { LocationPopupPosition } from "@/hooks/useLocationSearch";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  suggestions: LocationSuggestion[];
  position: LocationPopupPosition | null;
  onSelect: (suggestion: LocationSuggestion) => void;
};

export default function LocationSuggestionsPopup({
  t,
  suggestions,
  position,
  onSelect,
}: Props) {
  if (
    suggestions.length === 0 ||
    position === null ||
    typeof document === "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      id="astro-location-list"
      className="astro-suggestions fixed z-[99999] overflow-hidden rounded-xl border border-[#ded8ce] bg-white p-1 shadow-[0_18px_45px_rgba(54,43,29,0.18)]"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
      role="listbox"
      aria-label={t.profile.placeOfBirth}
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.placeId}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onSelect(suggestion)}
          className="astro-suggestion-item block w-full rounded-lg px-3 py-3 text-left"
        >
          <p className="text-sm font-medium text-[#394253]">
            {suggestion.name}
          </p>

          <p className="mt-1 text-[11px] leading-4 text-[#8b94a2]">
            {suggestion.displayName}
          </p>
        </button>
      ))}
    </div>,
    document.body,
  );
}
