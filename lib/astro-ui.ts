export type AnswerLanguage = "en" | "hi";

export type Meridiem = "AM" | "PM";

export type BirthLocation = {
  placeId: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneId: string;
};

export type BirthProfile = {
  name: string;
  gender: string;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: BirthLocation | null;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type LocationSuggestion = {
  placeId: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

export type ChatResponse = {
  message?: string;
  conversationTopic?: string;
  error?: string;
};

export type LocationSearchResponse = {
  suggestions?: LocationSuggestion[];
};

export type TimezoneResponse = {
  timezone?: string;
  timezoneId?: string;
};

export type ValidationKey =
  | "questionRequired"
  | "nameRequired"
  | "dateRequired"
  | "timeRequired"
  | "locationRequired";

export type UiText = {
  header: {
    subtitle: string;
    metaTitle: string;
    metaDescription: string;
  };

  hero: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    titleSuffix: string;
    description: string;
  };

  profile: {
    eyebrow: string;
    title: string;
    hide: string;
    show: string;

    name: string;
    namePlaceholder: string;

    gender: string;
    genderPlaceholder: string;

    male: string;
    female: string;
    other: string;

    dateOfBirth: string;

    timeOfBirth: string;
    hour: string;
    minute: string;
    period: string;
    am: string;
    pm: string;
    timeHelper: string;

    placeOfBirth: string;
    placePlaceholder: string;
    placeHelper: string;

    selectedTitle: string;

    latitude: string;
    longitude: string;
    timezone: string;
    timezoneFallback: string;
  };

  chat: {
    title: string;
    subtitle: string;

    welcomeTitle: string;
    welcomeDescription: string;

    quickQuestions: string[];

    thinkingTitle: string;
    thinkingSubtitle: string;

    answerLanguage: string;
    answerLanguageHelper: string;

    english: string;
    hindi: string;

    placeholder: string;

    send: string;

    keyboardHint: string;

    footerOm: string;
  };

  validation: Record<ValidationKey, string>;

  errors: {
    timezone: string;
    chat: string;
    generic: string;
    emptyAnswer: string;
  };

  footer: {
    description: string;
    disclaimer: string;
    right: string;
    poweredBy: string;
  };
};

export const STORAGE_KEY = "astroai_birth_profile_v1";

export const EMPTY_PROFILE: BirthProfile = {
  name: "",
  gender: "",
  dateOfBirth: "",
  timeOfBirth: "",
  placeOfBirth: null,
};

export function isAnswerLanguage(value: string): value is AnswerLanguage {
  return value === "en" || value === "hi";
}

export function isMeridiem(value: string): value is Meridiem {
  return value === "AM" || value === "PM";
}

export function isBirthLocation(value: unknown): value is BirthLocation {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const location = value as Record<string, unknown>;

  return (
    typeof location.placeId === "string" &&
    typeof location.name === "string" &&
    typeof location.displayName === "string" &&
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    typeof location.timezone === "string" &&
    location.timezone.trim().length > 0 &&
    typeof location.timezoneId === "string" &&
    location.timezoneId.trim().length > 0
  );
}

export function validateChatRequest(
  profile: BirthProfile,
  question: string,
): ValidationKey | null {
  if (question.trim().length === 0) {
    return "questionRequired";
  }

  if (profile.name.trim().length === 0) {
    return "nameRequired";
  }

  if (profile.dateOfBirth.length === 0) {
    return "dateRequired";
  }

  if (profile.timeOfBirth.length === 0) {
    return "timeRequired";
  }

  if (profile.placeOfBirth === null) {
    return "locationRequired";
  }

  return null;
}

export function formatTime12Hour(time: string): {
  hour: string;
  minute: string;
  period: Meridiem;
} {
  const match = /^(\d{2}):(\d{2})$/.exec(time);

  if (!match) {
    return {
      hour: "12",
      minute: "00",
      period: "AM",
    };
  }

  const hour24 = Number(match[1]);

  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour24) ||
    hour24 < 0 ||
    hour24 > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return {
      hour: "12",
      minute: "00",
      period: "AM",
    };
  }

  const period: Meridiem = hour24 >= 12 ? "PM" : "AM";

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour: String(hour12).padStart(2, "0"),

    minute: String(minute).padStart(2, "0"),

    period,
  };
}

export function setTimeFrom12Hour(
  hour: string,
  minute: string,
  period: Meridiem,
): string {
  const parsedHour = Number(hour);

  const parsedMinute = Number(minute);

  if (!Number.isInteger(parsedHour) || parsedHour < 1 || parsedHour > 12) {
    return "00:00";
  }

  if (
    !Number.isInteger(parsedMinute) ||
    parsedMinute < 0 ||
    parsedMinute > 59
  ) {
    return "00:00";
  }

  let hour24 = parsedHour % 12;

  if (period === "PM") {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, "0")}:${String(parsedMinute).padStart(
    2,
    "0",
  )}`;
}

const ENGLISH_TEXT: UiText = {
  header: {
    subtitle: "Vedic Astrology Guidance",

    metaTitle: "Astrology · Reflection",

    metaDescription: "Traditional wisdom, thoughtfully presented",
  },

  hero: {
    badge: "Peace · Auspiciousness",

    titlePrefix: "Discover insights from your",

    titleAccent: "birth chart",

    titleSuffix: "",

    description:
      "Enter your birth details and ask AstroAI about your personality, relationships, career, timing, strengths, challenges, and life patterns.",
  },

  profile: {
    eyebrow: "Birth profile",

    title: "Your details",

    hide: "Hide",

    show: "Show",

    name: "Name",

    namePlaceholder: "Enter your name",

    gender: "Gender",

    genderPlaceholder: "Select gender",

    male: "Male",

    female: "Female",

    other: "Other",

    dateOfBirth: "Date of birth",

    timeOfBirth: "Time of birth",

    hour: "Hour",

    minute: "Minute",

    period: "AM or PM",

    am: "AM",

    pm: "PM",

    timeHelper: "Select your local birth time in 12-hour format.",

    placeOfBirth: "Place of birth",

    placePlaceholder: "Search city or place",

    placeHelper:
      "Search and select your exact birthplace for accurate chart calculation.",

    selectedTitle: "Birthplace selected",

    latitude: "Latitude",

    longitude: "Longitude",

    timezone: "Timezone",

    timezoneFallback: "UTC",
  },

  chat: {
    title: "Astrology AI",

    subtitle: "Ask questions about your birth chart",

    welcomeTitle: "Welcome to Pal Jyotish",

    welcomeDescription:
      "Ask about your personality, career, relationships, marriage, finances, timing, or any other area of your life.",

    quickQuestions: [
      "What are my strengths?",
      "Tell me about my career",
      "What does my Moon sign mean?",
      "What about relationships?",
    ],

    thinkingTitle: "Reading your birth chart...",

    thinkingSubtitle: "Please wait a moment",

    answerLanguage: "Answer language",

    answerLanguageHelper: "Choose how AstroAI should respond",

    english: "English",

    hindi: "Hindi",

    placeholder: "Ask anything about your birth chart...",

    send: "Send message",

    keyboardHint: "Press Enter to send · Shift + Enter for a new line",

    footerOm: "Om Shanti",
  },

  validation: {
    questionRequired: "Please enter a question.",

    nameRequired: "Please enter your name first.",

    dateRequired: "Please select your date of birth.",

    timeRequired: "Please select your time of birth.",

    locationRequired: "Please select your exact birthplace.",
  },

  errors: {
    timezone: "The timezone could not be determined.",

    chat: "Unable to get an astrology response.",

    generic: "Something went wrong. Please try again.",

    emptyAnswer: "I could not generate a response.",
  },

  footer: {
    description: "Vedic astrology guidance for reflection and insight.",

    disclaimer:
      "AstroAI provides Vedic astrology interpretations for informational and entertainment purposes only. Astrology is not guaranteed and should not be considered professional medical, legal, financial, or other professional advice.",

    right: "For guidance and self-reflection, not guaranteed predictions.",

    poweredBy: "Powered by InfoWithPal",
  },
};

const HINDI_TEXT: UiText = {
  header: {
    subtitle: "वैदिक ज्योतिष मार्गदर्शन",

    metaTitle: "ज्योतिष · आत्मचिंतन",

    metaDescription: "पारंपरिक ज्ञान को सरल रूप में समझें",
  },

  hero: {
    badge: "शान्तिः · शुभं भवतु",

    titlePrefix: "अपनी",

    titleAccent: "जन्म कुंडली",

    titleSuffix: "से जीवन के संकेत जानें",

    description:
      "अपनी जन्म जानकारी दर्ज करें और AstroAI से व्यक्तित्व, रिश्ते, करियर, समय, शक्तियों, चुनौतियों और जीवन के विभिन्न पहलुओं के बारे में प्रश्न पूछें।",
  },

  profile: {
    eyebrow: "जन्म विवरण",

    title: "आपकी जानकारी",

    hide: "छिपाएँ",

    show: "दिखाएँ",

    name: "नाम",

    namePlaceholder: "अपना नाम लिखें",

    gender: "लिंग",

    genderPlaceholder: "लिंग चुनें",

    male: "पुरुष",

    female: "महिला",

    other: "अन्य",

    dateOfBirth: "जन्म तारीख",

    timeOfBirth: "जन्म का समय",

    hour: "घंटा",

    minute: "मिनट",

    period: "पूर्वाह्न या अपराह्न",

    am: "AM",

    pm: "PM",

    timeHelper: "अपने स्थानीय जन्म समय के अनुसार 12 घंटे वाला समय चुनें।",

    placeOfBirth: "जन्म स्थान",

    placePlaceholder: "शहर या स्थान खोजें",

    placeHelper: "सही जन्म स्थान चुनने से कुंडली की गणना अधिक सटीक होगी।",

    selectedTitle: "जन्म स्थान चुना गया",

    latitude: "अक्षांश",

    longitude: "देशांतर",

    timezone: "समय क्षेत्र",

    timezoneFallback: "UTC",
  },

  chat: {
    title: "ज्योतिष AI",

    subtitle: "अपनी जन्म कुंडली के बारे में प्रश्न पूछें",

    welcomeTitle: "पाल ज्योतिष AI में आपका स्वागत है",

    welcomeDescription:
      "अपने व्यक्तित्व, करियर, रिश्तों, विवाह, धन, समय या जीवन के किसी भी पहलू के बारे में प्रश्न पूछें।",

    quickQuestions: [
      "मेरी शक्तियाँ क्या हैं?",
      "मेरे करियर के बारे में बताएं",
      "मेरी चंद्र राशि का क्या अर्थ है?",
      "मेरे रिश्तों के बारे में बताएं",
    ],

    thinkingTitle: "कुंडली का विश्लेषण हो रहा है...",

    thinkingSubtitle: "कृपया कुछ क्षण प्रतीक्षा करें",

    answerLanguage: "उत्तर की भाषा",

    answerLanguageHelper: "AstroAI किस भाषा में उत्तर दे?",

    english: "अंग्रेज़ी",

    hindi: "हिन्दी",

    placeholder: "अपना प्रश्न पूछें...",

    send: "संदेश भेजें",

    keyboardHint:
      "Enter दबाएँ संदेश भेजने के लिए · Shift + Enter नई लाइन के लिए",

    footerOm: "ॐ शान्तिः",
  },

  validation: {
    questionRequired: "कृपया अपना प्रश्न लिखें।",

    nameRequired: "कृपया पहले अपना नाम लिखें।",

    dateRequired: "कृपया अपनी जन्म तारीख चुनें।",

    timeRequired: "कृपया अपना जन्म समय चुनें।",

    locationRequired: "कृपया अपना सही जन्म स्थान चुनें।",
  },

  errors: {
    timezone: "समय क्षेत्र निर्धारित नहीं हो सका।",

    chat: "ज्योतिषीय उत्तर प्राप्त नहीं हो सका।",

    generic: "कुछ गलत हो गया। कृपया दोबारा प्रयास करें।",

    emptyAnswer: "उत्तर तैयार नहीं हो सका।",
  },

  footer: {
    description: "आत्म-चिंतन और मार्गदर्शन के लिए वैदिक ज्योतिष की व्याख्या।",

    disclaimer:
      "AstroAI वैदिक ज्योतिष की व्याख्या केवल जानकारी और मनोरंजन के उद्देश्य से प्रदान करता है। ज्योतिष निश्चित भविष्यवाणी नहीं है और इसे चिकित्सा, कानूनी, वित्तीय या किसी अन्य पेशेवर सलाह के रूप में नहीं माना जाना चाहिए।",

    right: "मार्गदर्शन और आत्म-चिंतन के लिए, निश्चित भविष्यवाणी नहीं।",

    poweredBy: "Powered by InfoWithPal",
  },
};

export const UI_TEXT: Record<AnswerLanguage, UiText> = {
  en: ENGLISH_TEXT,
  hi: HINDI_TEXT,
};

export function getUiText(language: AnswerLanguage): UiText {
  return UI_TEXT[language];
}
