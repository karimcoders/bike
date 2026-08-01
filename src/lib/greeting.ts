// =====================================================================
// GREETING / FAREWELL PREDICTION
// ---------------------------------------------------------------------
// Predicts culturally appropriate greeting & farewell based on the
// shop owner's name. Designed for the Indian subcontinent context
// (rural Bihar bike spare-parts shop) where shopkeepers serve both
// Hindu and Muslim communities.
//
// Heuristic approach:
//   - Checks name parts against common Muslim name markers
//     (prefixes like Md/Mohammad/Abdul, suffixes like -uddin/-ur-rahman,
//      common names like Ali/Ahmed/Khan/Intiyaaz, etc.)
//   - If a Muslim marker is found → "Assalamo Alaikum" / "Shukriya"
//   - Otherwise → "Namaste" / "Dhanyawad" (default for Indian context)
//
// This is intentionally a HEURISTIC, not a religious classifier.
// It can be wrong. Shop owners can always override by editing their
// name in Settings (or we can add an explicit override setting later).
// =====================================================================

export type GreetingStyle = "namaste" | "salaam";

// ---- Muslim name markers (lowercase, trimmed) ----
// Common prefixes / title words
const MUSLIM_PREFIXES = new Set([
  "md",
  "mohd",
  "mohammad",
  "mohammed",
  "muhammad",
  "mahammad",
  "abdul",
  "abdullah",
  "abdur",
  "abd",
  "abu",
  "syed",
  "sayyed",
  "sayed",
  "sheikh",
  "shaikh",
  "shaykh",
  "maulana",
  "maulvi",
  "haji",
  "hafiz",
  "hafeez",
  "qari",
  "moulana",
]);

// Common Muslim given names & surnames (substrings matched as whole words)
const MUSLIM_NAMES = new Set([
  "khan",
  "ali",
  "ahmed",
  "ahmad",
  "hussain",
  "husain",
  "hasan",
  "hasan",
  "iqbal",
  "intiyaaz",
  "intezar",
  "imran",
  "irfan",
  "aslam",
  "akhtar",
  "anwar",
  "farooq",
  "faisal",
  "imtiaz",
  "javed",
  "khalid",
  "mahmood",
  "mahmud",
  "mansoor",
  "nadeem",
  "nasir",
  "omar",
  "umar",
  "usman",
  "qadir",
  "rafiq",
  "rashid",
  "rizwan",
  "sajid",
  "salim",
  "sameer",
  "shahid",
  "shakeel",
  "sohail",
  "tahir",
  "tanvir",
  "wahid",
  "wasim",
  "yusuf",
  "yakoob",
  "yaqoob",
  "zakir",
  "zeeshan",
  "bilal",
  "faizan",
  "hamza",
  "aamir",
  "adnan",
  "aftab",
  "arshad",
  "ayub",
  "bashir",
  "dawood",
  "ehsan",
  "ghulam",
  "hafeez",
  "hashim",
  "inam",
  "jamal",
  "kamran",
  "kashif",
  "latif",
  "mazhar",
  "mohsin",
  "mubeen",
  "mujahid",
  "munir",
  "mushtaq",
  "naeem",
  "naveed",
  "nazir",
  "noor",
  "qaiser",
  "raheel",
  "rehman",
  "rahman",
  "saad",
  "saeed",
  "sajjad",
  "shabir",
  "shafiq",
  "shoaib",
  "siddiqui",
  "siddique",
  "tabish",
  "talha",
  "uzair",
  "waseem",
  "yasir",
  "zahir",
  "zaman",
  "zubair",
  "ansari",
  "qureshi",
  "quadri",
  "razvi",
  "bukhari",
  "nadwi",
  "farooqui",
  "farooqi",
  "pathan",
  "miya",
  "miyan",
  "sheikh",
  "mian",
]);

// Muslim name suffix patterns (checked via regex on the full name)
const MUSLIM_SUFFIX_PATTERNS = [
  /uddin\b/i,
  /\bur\s*rahman\b/i,
  /\bul\s*haq\b/i,
  /\bul\s*hassan\b/i,
  /\bal\s*/i,
  /\brehman\b/i,
  /\brahman\b/i, // careful: "rahman" could be Hindu too (Brahma), but in name context usually Muslim
];

// ---- Hindu name markers (for explicit Hindu detection, optional) ----
// Used to increase confidence when both communities share a name.
const HINDU_NAMES = new Set([
  "sharma",
  "verma",
  "gupta",
  "singh",
  "kumar",
  "das",
  "lal",
  "ram",
  "sharan",
  "pandey",
  "tiwari",
  "dubey",
  "mishra",
  "shukla",
  "agarwal",
  "maheshwari",
  "joshi",
  "bhat",
  "rao",
  "reddy",
  "nair",
  "patel",
  "mehta",
  "chopra",
  "malhotra",
  "khanna",
  "kapoor",
  "sachdev",
  "anand",
  "banerjee",
  "mukherjee",
  "chatterjee",
  "ghosh",
  "bhattacharya",
  "iyer",
  "iyengar",
  "pillai",
  "menon",
  "krishna",
  "shyam",
  "mohan",
  "prasad",
  "dev",
  "pal",
  "chand",
  "shiv",
  "hanuman",
  "ganesh",
  "lakshmi",
  "saraswati",
  "durga",
  "parvati",
  "sita",
  "radha",
  "rukmini",
  "vishnu",
  "brahma",
  "mahadev",
  "bhagwan",
  "sundar",
  "sunder",
  "thakur",
  "chauhan",
  "yadav",
  "prasad",
  "sah",
  "mandal",
  "ray",
  "sen",
  "dutta",
  "bose",
]);

/**
 * Predict greeting style from a person's full name.
 *
 * @param name - Full name (e.g. "Intiyaaz Khan", "Sharma Ji", "Md. Aslam")
 * @returns "salaam" if Muslim markers found, "namaste" otherwise
 */
export function predictGreetingStyle(name: string | null | undefined): GreetingStyle {
  if (!name || !name.trim()) return "namaste";

  const lower = name.toLowerCase().trim();
  const parts = lower.split(/[\s.\-_,]+/).filter(Boolean);

  // Check explicit Hindu surname first — if strongly Hindu, return namaste
  // (e.g. "Sharma Ji" → namaste, even though "Ji" isn't Muslim)
  let hinduHits = 0;
  let muslimHits = 0;

  for (const part of parts) {
    if (MUSLIM_PREFIXES.has(part)) muslimHits++;
    if (MUSLIM_NAMES.has(part)) muslimHits++;
    if (HINDU_NAMES.has(part)) hinduHits++;
  }

  // Check suffix patterns on the full name
  for (const pattern of MUSLIM_SUFFIX_PATTERNS) {
    if (pattern.test(lower)) muslimHits++;
  }

  // Decision: Muslim markers win unless strong Hindu signal + no Muslim signal
  if (muslimHits > 0 && muslimHits >= hinduHits) return "salaam";
  if (muslimHits > 0 && hinduHits === 0) return "salaam";
  return "namaste";
}

/**
 * Get the greeting word based on the owner's name.
 * @param name - Owner's full name
 * @returns "Namaste" or "Assalamo Alaikum"
 */
export function getGreeting(name: string | null | undefined): string {
  const style = predictGreetingStyle(name);
  return style === "salaam" ? "Assalamo Alaikum" : "Namaste";
}

/**
 * Get the farewell word for bill footer based on the owner's name.
 * @param name - Owner's full name
 * @returns "Dhanyawad" or "Shukriya"
 */
export function getFarewell(name: string | null | undefined): string {
  const style = predictGreetingStyle(name);
  return style === "salaam" ? "Shukriya" : "Dhanyawad";
}

/**
 * Get the emoji for the greeting.
 * @returns folded hands emoji 🙏 (used for both — culturally neutral)
 */
export function getGreetingEmoji(): string {
  return "🙏";
}
