# Daivik AI — Development & Usage Flow Diagram

> Email sending flow is intentionally excluded.

## Main End-to-End Flow

```text
┌──────────────────────────────┐
│        USER OPENS APP        │
│       Daivik AI         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        BIRTH PROFILE         │
│                              │
│  • Name                      │
│  • Gender                    │
│  • Date of Birth             │
│  • Time of Birth             │
│  • Place of Birth            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       LOCATION SEARCH        │
│    /api/location/search      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     LOCATION SUGGESTIONS     │
│                              │
│   User selects exact place   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       SELECTED LOCATION      │
│                              │
│  Latitude                    │
│  Longitude                   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       TIMEZONE LOOKUP        │
│   /api/location/timezone     │
│                              │
│   geo-tz → timezoneId        │
│   Example: Europe/London     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     COMPLETE BIRTH PROFILE   │
│                              │
│  Name                        │
│  DOB / Time                  │
│  Latitude                    │
│  Longitude                   │
│  Timezone                    │
│  Timezone ID                 │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       USER WRITES PROMPT     │
│                              │
│  Example:                    │
│  "Mere career ke baare      │
│   mein batao"                │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      FRONTEND VALIDATION     │
│      validateChatRequest     │
└──────────────┬───────────────┘
               │
          ┌────┴────┐
          │         │
       Invalid     Valid
          │         │
          ▼         ▼
┌──────────────┐  ┌──────────────────────────────┐
│ Show error   │  │         /api/chat            │
│ message      │  │                              │
└──────────────┘  └──────────────┬───────────────┘
                                 │
                                 ▼
                     ┌───────────────────────────┐
                     │  VALIDATE BIRTH PROFILE   │
                     │                           │
                     │ • Name                    │
                     │ • DOB                     │
                     │ • Time                    │
                     │ • Latitude                │
                     │ • Longitude               │
                     │ • Timezone                │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │  RESOLVE TIMEZONE OFFSET  │
                     │                           │
                     │ Europe/London             │
                     │       ↓                   │
                     │ Actual UTC offset         │
                     │ for birth date/time       │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │     SWISS EPHEMERIS      │
                     │                           │
                     │  Calculate actual chart  │
                     └─────────────┬─────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              │                    │                     │
              ▼                    ▼                     ▼
      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
      │   PLANETS    │     │   HOUSES     │     │  ASCENDANT   │
      └──────────────┘     └──────────────┘     └──────────────┘
              │                    │                     │
              └────────────────────┼─────────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              │                    │                     │
              ▼                    ▼                     ▼
      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
      │ NAKSHATRAS   │     │    DASHA     │     │  AYANAMSHA   │
      └──────────────┘     └──────────────┘     └──────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │ ASTROLOGY CONTEXT BUILDER │
                     │                           │
                     │ • Actual chart data      │
                     │ • User question          │
                     │ • Selected language      │
                     │ • Astrology rules        │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │       GEMINI API          │
                     │                           │
                     │ Interpret supplied chart │
                     │ Do not invent calculations│
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │      FINAL RESPONSE       │
                     │                           │
                     │ English / Hindi           │
                     │ Astrology-based answer    │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                     ┌───────────────────────────┐
                     │       CHAT UI SHOWS       │
                     │       AI RESPONSE        │
                     └───────────────────────────┘
```

## Development Architecture

```text
                         ┌───────────────────────┐
                         │       NEXT.JS         │
                         │    TypeScript App     │
                         └───────────┬───────────┘
                                     │
             ┌───────────────────────┼────────────────────────┐
             │                       │                        │
             ▼                       ▼                        ▼
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│     FRONTEND       │   │     API ROUTES     │   │   SHARED LIBRARY   │
│                    │   │                    │   │                    │
│ app/page.tsx       │   │ /location/search   │   │ lib/astro-ui.ts    │
│                    │   │ /location/timezone │   │                    │
│ Profile UI         │   │ /chat              │   │ Types               │
│ Location UI        │   │                    │   │ Validation          │
│ Chat UI            │   │                    │   │ English/Hindi text  │
│ Language selector  │   │                    │   │                    │
└────────────────────┘   └──────────┬─────────┘   └────────────────────┘
                                    │
                     ┌──────────────┼───────────────┐
                     │              │               │
                     ▼              ▼               ▼
              ┌────────────┐ ┌─────────────┐ ┌─────────────┐
              │  geo-tz    │ │ SwissEph    │ │   Gemini    │
              │ Timezone   │ │ Birth Chart │ │ AI Reading  │
              └────────────┘ └─────────────┘ └─────────────┘
```

## Location Flow

```text
Search input
    │
    ▼
/api/location/search?q=...
    │
    ▼
Suggestions
    │
    ▼
User selects place
    │
    ├──────────────► Latitude
    │
    ├──────────────► Longitude
    │
    ▼
/api/location/timezone
    │
    ▼
geo-tz
    │
    ▼
timezoneId
    │
    ▼
Birth Profile
```

## Chart Calculation Flow

```text
Birth Date ────────┐
Birth Time ────────┤
Latitude ──────────┤
Longitude ─────────┤
Timezone ID ───────┘
          │
          ▼
 resolveTimezoneOffset()
          │
          ▼
   Numeric UTC Offset
          │
          ▼
    Julian Day
          │
          ▼
  Swiss Ephemeris
          │
    ┌─────┼───────────────┐
    │     │       │       │
    ▼     ▼       ▼       ▼
 Planets Houses Ascendant Nakshatra
    │     │       │       │
    └─────┼───────┼───────┘
          │
          ▼
       Dasha
          │
          ▼
      SwissChart
```

## AI Interpretation Flow

```text
                    SwissChart
                        │
                        ▼
             ┌────────────────────┐
             │ Astrology Context  │
             └─────────┬──────────┘
                       │
        ┌──────────────┼───────────────┐
        │              │               │
        ▼              ▼               ▼
   User Prompt     Language       Astro Rules
        │              │               │
        └──────────────┼───────────────┘
                       │
                       ▼
                 Gemini API
                       │
                       ▼
              Astrology Answer
                       │
                       ▼
                    Chat UI
```

## Language Flow

```text
                  Language Selector
                         │
                  ┌──────┴──────┐
                  │             │
                  ▼             ▼
              English         Hindi
                  │             │
                  ▼             ▼
            English UI       Hindi UI
                  │             │
                  ▼             ▼
          English response  Hindi response
```

## Single-Profile Restriction

```text
Primary Birth Profile
        │
        ▼
   One Swiss Chart
        │
        ▼
   Gemini Analysis

Second Person Birth Details inside prompt
        │
        ▼
   NOT CALCULATED
        │
        ▼
No second-person Kundli / matching currently
```

## Non-Astrology Restriction

```text
User Question
      │
      ▼
Is it Vedic Astrology related?
      │
   ┌──┴──┐
   │     │
  YES    NO
   │     │
   ▼     ▼
Process  Do not provide
Astrology unrelated data
          │
          ▼
   Ask user for an
 astrology-related question
```

## Music Flow

```text
.env.local / Vercel
        │
        ├── NEXT_PUBLIC_ASTRO_MUSIC_ENABLED
        │
        └── NEXT_PUBLIC_ASTRO_MUSIC_VOLUME_PERCENT
                         │
                         ▼
                 User submits prompt
                         │
                         ▼
                   playOmSound()
                         │
                         ▼
                 /audio/om.mp3
```

## Production Flow

```text
Local Development
       │
       ├── npm run lint
       │
       └── npm run build
       │
       ▼
    GitHub
       │
       ▼
    Vercel
       │
       ├── Environment Variables
       │
       └── Production Deployment
       │
       ▼
  Daivik AI
       │
       ▼
     User
```

## Core Principle

```text
                 ┌─────────────────────────┐
                 │   USER BIRTH DETAILS    │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │   SWISS EPHEMERIS      │
                 │  CALCULATES THE CHART  │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │      GEMINI AI          │
                 │   INTERPRETS THE CHART  │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │   Daivik AI CHAT   │
                 └─────────────────────────┘
```
