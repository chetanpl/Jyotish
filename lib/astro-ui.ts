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
    questionAria: string;
    cooldownLabel: string;
    inputLabel: string;
    sendTitle: string;
  };

  voice: {
    start: string;
    tapToStop:string;
    stop: string;
    listening: string;
    cancel: string;
    transcribing: string;
    checkText: string;
    recordingPlaceholder: string;
    micHelp: string;
    errors: {
      unsupported: string;
      denied: string;
      noMic: string;
      tooShort: string;
      noSpeech: string;
      failed: string;
    };
  };

  validation: Record<ValidationKey, string>;

  errors: {
    timezone: string;
    chat: string;
    generic: string;
    emptyAnswer: string;
  };

  feedback: {
    title: string;
    subtitle: string;

    helpful: string;
    notHelpful: string;

    ratingLabel: string;

    improvementLabel: string;

    improvements: {
      specific: string;
      detailed: string;
      explanation: string;
      timing: string;
      easier: string;
      other: string;
    };

    messageLabel: string;
    messagePlaceholder: string;

    send: string;
    sending: string;

    validationHelpful: string;
    validationRating: string;
    validationMessage: string;

    successTitle: string;
    successMessage: string;

    saveError: string;
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
      "When will I get married?",
      "When will I get a job or achieve career success?",
      "Will I end up with the person I love?",
      "When will wealth and prosperity come into my life?",
      "What does the near future hold for me?"
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
    questionAria: "Type your question",
    cooldownLabel: "You can ask your next question in",

    inputLabel: "Type your question",

    sendTitle: "Send question",
  },
  voice: {
    start: "Start voice recording",
      tapToStop: "Tap the microphone to finish recording…",
    stop: "Stop recording and transcribe",

    listening: "Listening…",

    cancel: "Cancel recording",

    transcribing: "Turning your voice into text…",

    checkText: "Please check the text, especially names, before sending.",

    recordingPlaceholder: "Tap the microphone to finish recording…",

    micHelp:"If microphone access is blocked, enable it in your browser's site settings.",
    errors: {
      unsupported: "Your browser does not support voice recording.",

      denied: "Microphone permission was denied.",

      noMic: "No microphone was found.",

      tooShort: "The recording is too short. Please speak again.",

      noSpeech: "Could not hear any speech. Please try again.",

      failed: "Could not convert your voice to text. Please try again or type.",
    },
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

  feedback: {
    title: "How was this answer?",

    subtitle:
      "Please select Helpful or Not helpful, give a rating, and enter a message.",

    helpful: "Helpful",

    notHelpful: "Not helpful",

    ratingLabel: "Rate this answer",

    improvementLabel: "What could be improved?",

    improvements: {
      specific: "More specific",

      detailed: "More detailed",

      explanation: "Better explanation",

      timing: "Better timing",

      easier: "Easier to understand",

      other: "Other",
    },

    messageLabel: "Tell us more",

    messagePlaceholder:
      "What would make this answer better?",

    send: "Send Feedback",

    sending: "Sending...",

    validationHelpful:
      "Please select Helpful or Not helpful.",

    validationRating:
      "Please select a rating from 1 to 5 stars.",

    validationMessage:
      "Please enter a message about your feedback.",

    successTitle: "Thank you for your feedback",

    successMessage:
      "Your feedback helps us improve AstroAI.",

    saveError:
      "Unable to save your feedback. Please try again.",
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
      "मेरी शादी कब होगी?",
      "मुझे नौकरी कब मिलेगी या करियर में सफलता कब मिलेगी?",
      "क्या मेरा प्यार मुझे मिलेगा?",
      "मेरे जीवन में धन और समृद्धि कब आएगी?",
      "मेरा आने वाला समय कैसा रहेगा?"
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

    cooldownLabel: "अगला प्रश्न पूछने के लिए प्रतीक्षा करें",
inputLabel: "अपना प्रश्न लिखें",
    questionAria: "अपना प्रश्न लिखें",

    sendTitle: "प्रश्न भेजें",
  },
  voice: {
    start: "वॉइस रिकॉर्डिंग शुरू करें",
    stop: "रिकॉर्डिंग रोकें और टेक्स्ट बनाएँ",
    tapToStop: "रिकॉर्डिंग रोकने के लिए माइक्रोफ़ोन दबाएँ…",
    listening: "सुन रहा है…",
    cancel: "रिकॉर्डिंग रद्द करें",
    transcribing: "आपकी आवाज़ को टेक्स्ट में बदला जा रहा है…",
    checkText: "कृपया टेक्स्ट जाँच लें, खासकर नाम, फिर भेजें।",
    recordingPlaceholder: "रिकॉर्डिंग रोकने के लिए माइक्रोफ़ोन दबाएँ…",
    micHelp: "अगर माइक्रोफ़ोन की अनुमति बंद है, तो ब्राउज़र की साइट सेटिंग में उसे चालू करें।",
    errors: {
      unsupported: "आपका ब्राउज़र वॉइस रिकॉर्डिंग सपोर्ट नहीं करता।",
      denied: "माइक्रोफ़ोन की अनुमति नहीं मिली।",
      noMic: "कोई माइक्रोफ़ोन नहीं मिला।",
      tooShort: "रिकॉर्डिंग बहुत छोटी है। कृपया दोबारा बोलें।",
      noSpeech: "आवाज़ साफ़ नहीं सुनाई दी। कृपया दोबारा बोलें।",
      failed: "आवाज़ को टेक्स्ट में नहीं बदला जा सका। कृपया दोबारा प्रयास करें या टाइप करें।",
    },
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

    feedback: {
      title: "यह उत्तर कैसा लगा?",

      subtitle:
        "कृपया उपयोगी या उपयोगी नहीं चुनें, रेटिंग दें और अपना संदेश लिखें।",

      helpful: "उपयोगी",

      notHelpful: "उपयोगी नहीं",

      ratingLabel: "इस उत्तर को रेट करें",

      improvementLabel: "क्या बेहतर किया जा सकता है?",

      improvements: {
        specific: "अधिक विशिष्ट",

        detailed: "अधिक विस्तृत",

        explanation: "बेहतर व्याख्या",

        timing: "बेहतर समय",

        easier: "समझने में आसान",

        other: "अन्य",
      },

      messageLabel: "अपनी राय बताएं",

      messagePlaceholder:
        "इस उत्तर को बेहतर बनाने के लिए क्या किया जा सकता है?",

      send: "फीडबैक भेजें",

      sending: "भेजा जा रहा है...",

      validationHelpful:
        "कृपया उपयोगी या उपयोगी नहीं में से एक चुनें।",

      validationRating:
        "कृपया 1 से 5 स्टार की रेटिंग चुनें।",

      validationMessage:
        "कृपया अपने फीडबैक के बारे में संदेश लिखें।",

      successTitle: "आपके फीडबैक के लिए धन्यवाद",

      successMessage:
        "आपका फीडबैक AstroAI को बेहतर बनाने में मदद करता है।",

      saveError:
        "फीडबैक सेव नहीं हो सका। कृपया दोबारा प्रयास करें।",
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