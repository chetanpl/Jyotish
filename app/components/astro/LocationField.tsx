import type { RefObject } from "react";
import type { UiText } from "./types";

type Props = {
  t: UiText;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  loading: boolean;
  selected: boolean;
  error: string | null;
  hasSuggestions: boolean;
  onChange: (value: string) => void;
};

export default function LocationField({
  t,
  inputRef,
  value,
  loading,
  selected,
  error,
  hasSuggestions,
  onChange,
}: Props) {
  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="astro-field">
      <label
        htmlFor="placeOfBirth"
        className="mb-2 block text-xs font-medium text-[#4f596a]"
      >
        {t.profile.placeOfBirth}
      </label>

      <div className="relative z-20">
        <input
          ref={inputRef}
          id="placeOfBirth"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t.profile.placePlaceholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasSuggestions}
          aria-controls="astro-location-list"
          aria-haspopup="listbox"
          aria-invalid={error !== null}
          className={`astro-input w-full rounded-xl border bg-white px-4 py-3 ${
            value.trim() ? "pr-20" : "pr-10"
          } text-sm outline-none ${
            loading
              ? "border-[#6b4f8a]/50"
              : selected
                ? "border-emerald-400/50"
                : error
                  ? "border-rose-400/60"
                  : "border-[#d8d2c7]"
          }`}
        />

        {/* Clear button */}
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            aria-label="Clear location"
            title="Clear location"
            className="absolute right-9 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-xl leading-none text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        )}

        {/* Loading indicator */}
        {loading && (
          <div
            className="absolute right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center"
            aria-hidden="true"
          >
            <span className="astro-loader-ring absolute h-7 w-7 rounded-full border border-[#6b4f8a]/20" />

            <span className="astro-location-om relative flex h-7 w-7 items-center justify-center rounded-full bg-[#f8f4fb] text-sm text-[#6b4f8a]">
              ॐ
            </span>
          </div>
        )}

        {/* Selected indicator */}
        {!loading && selected && !value.trim() && (
          <div
            className="astro-success absolute right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-xs text-emerald-600"
            aria-hidden="true"
          >
            ✓
          </div>
        )}

        {!loading && selected && value.trim() !== "" && (
          <div
            className="astro-success pointer-events-none absolute right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-xs text-emerald-600"
            aria-hidden="true"
          >
            ✓
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-[#98a0ad]">
        {t.profile.placeHelper}
      </p>

      {error && (
        <p className="mt-2 text-[11px] font-medium leading-4 text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}