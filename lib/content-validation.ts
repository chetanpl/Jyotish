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
  // 1) Special characters check: kisi bhi language ke letters, matras, digits, spaces allowed
  if (/[^\p{L}\p{M}\p{N}\s]{3,}/u.test(value)) {
    return "Please use no more than 2 special characters together.";
  }

  // 2) Blocked words check (English words)
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

  return null;
}