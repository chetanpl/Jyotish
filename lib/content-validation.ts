const BLOCKED_WORDS = [
  "fuck",
  "fucking",
  "fucked",
  "fucker",
  "shit",
  "shitty",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "piss",
  "slut",
  "whore",
  "porn",
  "pornography",
  "porno",
  "xxx",
  "sexvideo",
  "sexvideos",
  "nude",
  "nudes",
  "naked",
  "blowjob",
  "handjob",
  "masturbation",
  "masturbate",
  "orgasm",
];

export function validateUserContent(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  const words = normalized.split(" ");

  if (words.some((word) => BLOCKED_WORDS.includes(word))) {
    return "Please avoid abusive or explicit language.";
  }

  if (/[^a-zA-Z0-9\s]{3,}/.test(value)) {
    return "Please use no more than 2 special characters together.";
  }

  return null;
}
