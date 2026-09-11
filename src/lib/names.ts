/**
 * Matching AHSAA schedule-PDF school names to canonical roster names.
 *
 * The PDFs use long form ("B.B. Comer High School"); the roster uses short
 * ("BB Comer"). Resolution order, most trustworthy first:
 *
 *   1. explicit alias table
 *   2. exact normalized match
 *   3. progressive suffix stripping ("Briarwood Christian School" → Briarwood)
 *   4. classification + region disambiguation (for genuinely ambiguous names)
 *   5. fuzzy similarity, 0.86 cutoff
 *
 * Known weakness carried over from the original: step 4 trusts the PDF's
 * classification, and the PDFs contain classification errors. An error on an
 * ambiguous name could silently pick the wrong school, so every non-exact
 * match is reported with its confidence for a human to check.
 */

import type { Classification, Team } from "./types";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** State associations that mark a school as out-of-state. */
const OOS_ASSOCIATIONS = new Set([
  "FHSA",
  "FHSAA",
  "GHSA",
  "GHSAA",
  "MHSA",
  "MHSAA",
  "TSSAA",
  "LHSAA",
  "MAIS",
  "GISA",
  "AAA",
]);

export function isOutOfStateToken(cl: string): boolean {
  return OOS_ASSOCIATIONS.has(cl.trim().toUpperCase());
}

/**
 * Alabama schools that play a schedule but are not ranked: they appear in the
 * PDFs with an AHSAA classification yet are not championship-eligible, so they
 * have no roster entry. Treated exactly like out-of-state opponents — their
 * games count toward the opponent's record and are valued off the field mean,
 * but they never receive a rating or a ranking of their own.
 *
 * The shipped list is only a fallback. The live one lives in the `non_members`
 * table so it can be maintained without a deploy — schools go independent
 * between seasons, and every one that does otherwise turns into a recurring
 * pile of "no roster match" reports.
 */
export const NON_MEMBER_SCHOOLS = new Set(["vina"]);

/**
 * Whether a name is a known non-member.
 *
 * `extra` holds the admin-maintained names, already normalized. Both sides are
 * compared across suffix variants so "Tharptown High School" matches an entry
 * of "Tharptown".
 */
export function isNonMember(raw: string, extra?: Set<string>): boolean {
  const forms = variants(raw);
  return forms.some((f) => NON_MEMBER_SCHOOLS.has(f) || extra?.has(f));
}

/** Normalizes a stored list of non-member names for matching. */
export function nonMemberSet(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const v of variants(n)) out.add(v);
  return out;
}

/** Every US state except Alabama — a trailing one marks an outside opponent. */
const OTHER_STATE_CODES = new Set(
  ("AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" "),
);

/**
 * Out-of-state opponents are written "Pace FL" — the name followed by a state
 * code. Checked against a real state list so Roman numerals and initialisms
 * ("St. John Paul II") are not mistaken for one.
 */
export function hasOutOfStateSuffix(raw: string): boolean {
  const m = raw.trim().match(/\b([A-Za-z]{2})\.?$/);
  return m ? OTHER_STATE_CODES.has(m[1].toUpperCase()) : false;
}

/** Maps the PDF's classification token to a roster classification. */
export function normalizeClassToken(cl: string): Classification | null {
  // Tolerates the `4a`` style typos the PDFs contain.
  const t = cl.trim().replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  // The private bracket is written three ways across AHSAA documents:
  // "Ind-AA" on the schedule sheets, "Double AA" on the results sheets, "AA"
  // on the roster.
  if (t === "IND-A" || t === "SINGLEA" || t === "SINGLE-A") return "A";
  if (t === "IND-AA" || t === "DOUBLEAA" || t === "DOUBLE-AA") return "AA";
  const m = t.match(/^([1-6])A$/);
  if (m) return `${m[1]}A` as Classification;
  if (t === "7A") return "6A"; // stale 2025 label — old 7A is now 6A
  return null;
}

export function parseRegionToken(reg: string): number | null {
  const m = reg.trim().match(/R-?\s*(\d)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Explicit aliases: source spelling → roster name. Everything here is a case
 * the generic rules cannot get right on their own.
 */
export const ALIASES: Record<string, string> = {
  // Initials dropped by the roster
  "A.H. Parker High School": "Parker",
  "A.P. Brewer High School": "Brewer",
  "P.D. Jackson-Olin High School": "Jackson-Olin",
  "Paul W. Bryant High School": "Paul Bryant",
  "Mary G. Montgomery High School": "Mary Montgomery",
  "G.W. Carver-Birmingham HS": "Carver-Birmingham",
  "Carver HS - Montgomery": "Carver-Montgomery",
  "G.W. Long High School": "GW Long",
  "B.B. Comer High School": "BB Comer",
  "J.U. Blacksher High School": "JU Blacksher",
  "J.F. Shields High School": "JF Shields",
  "R.C. Hatch High School": "RC Hatch",
  "J.B. Pennington High School": "JB Pennington",
  "T.R. Miller High School": "TR Miller",
  "W.S. Neal High School": "WS Neal",
  "B.C. Rain High School": "BC Rain",
  "B.T. Washington High School": "BT Washington",
  "Booker T. Washington, Tuskegee": "BT Washington",
  "Johnson Abernathy Graetz (JAG) HS": "JAG",
  "Johnson-Abernathy-Graetz HS": "JAG",
  "D.A.R. High School": "DAR",
  "Percy L. Julian High School": "Percy Julian",
  "Mae C. Jemison High School": "Mae Jemison",

  // Location suffix goes after a hyphen in the roster
  "Central HS, Hayneville": "Central-Hayneville",
  "Central High School, Hayneville": "Central-Hayneville",
  "Central High School, Coosa": "Central-Coosa",
  "Central High School, Tuscaloosa": "Central-Tuscaloosa",
  "Central, Clay County HS": "Central-Clay County",
  "Central High School, Florence": "Central-Florence",
  "Central High School, Phenix City": "Central-Phenix City",
  "Hillcrest High School, Evergreen": "Hillcrest-Evergreen",
  "Hillcrest High School, Tuscaloosa": "Hillcrest-Tuscaloosa",
  "Southside High School, Gadsden": "Southside-Gadsden",
  "Southside High School, Selma": "Southside-Selma",
  "Lee High School, Huntsville": "Lee-Huntsville",
  "Lee-Scott Academy": "Lee-Scott",

  // Abbreviations and spelling drift
  "North Sand Mtn. High School": "North Sand Mountain",
  "Saint James School": "St. James",
  "St. James School": "St. James",
  "Lindsay Lane Christian Academy": "Lindsay Lane",
  "Trinity Presbyterian School": "Trinity",
  "Vincent Middle High School": "Vincent",
  "Ramsay IB High School": "Ramsay",
  "Alabama Aerospace & Aviation": "Alabama Aerospace and Aviation",
  "Alabama Aerospace and Aviation Academy": "Alabama Aerospace and Aviation",
  "Sumter Central High School": "Sumter Central",
  "University Charter School": "University Charter",
  "Breakthrough Charter School": "Breakthrough Charter",
  "Decatur Heritage Christian Academy": "Decatur Heritage",
  "Westbrook Christian School": "Westbrook Christian",
  "Coosa Christian School": "Coosa Christian",
  "Shoals Christian School": "Shoals Christian",
  "Mars Hill Bible School": "Mars Hill",
  "Providence Christian School": "Providence Christian",
  "Northside Methodist Academy": "Northside Methodist",
  "Bayshore Christian School": "Bayshore Christian",
  "Prattville Christian Academy": "Prattville Christian",
  "Pike Liberal Arts School": "Pike Liberal Arts",
  "Fort Dale Academy": "Fort Dale",
  "Glenwood School": "Glenwood",
  "Houston Academy": "Houston Academy",
  "Madison Academy": "Madison Academy",
  "St. John Paul II Catholic High School": "St. John Paul II",
  "McGill-Toolen Catholic High School": "McGill-Toolen",
  "McGill- Toolen Catholic High School": "McGill-Toolen",
  "Montgomery Catholic School": "Montgomery Catholic",
  "Montgomery Catholic Prep": "Montgomery Catholic",
  "St. Paul's Episcopal School": "St. Paul's",
  "St. Luke's Episcopal School": "St. Luke's",
  "St. Michael Catholic High School": "St. Michael",
  "Holy Spirit Catholic High School": "Holy Spirit",
  "John Carroll Catholic High School": "John Carroll",
  "Briarwood Christian School": "Briarwood",
  "Pickens Academy": "Pickens Academy",
  "Ellwood Christian Academy": "Ellwood Christian",
  "Victory Christian School": "Victory Christian",
  "Whitesburg Christian Academy": "Whitesburg Christian",
  "Westminster Christian Academy": "Westminster Christian",
  "American Christian Academy": "American Christian",
  "Cottage Hill Christian Academy": "Cottage Hill Christian",
  "Alabama Christian Academy": "Alabama Christian",
  "Mobile Christian School": "Mobile Christian",
  "Tuscaloosa Academy": "Tuscaloosa Academy",
  "Donoho School": "Donoho",
  "The Donoho School": "Donoho",
  "Randolph School": "Randolph",
  "Bayside Academy": "Bayside Academy",
  "Faith Academy": "Faith Academy",
  "Kate Duncan Smith DAR": "DAR",
  "Mattie T. Blount": "Blount",
  "Booker T. Washington": "BT Washington",
  "LeFlore Magnet": "LeFlore",
  Pennington: "JB Pennington",
  "Gordo HSF": "Gordo",
  "Monroe County High School": "Monroe County",
  "Escambia County High School": "Escambia County",

  // Formal names the roster shortens. These arrived with an earlier importer
  // and outlived it: they are just the schools' full names, which is exactly
  // what a state sheet is liable to print. The ones already spelled out above
  // are not repeated.
  "Dothan High": "Dothan",
  "Phillips Bear Creek": "Phillips",
  "Lindsay Lane Christian": "Lindsay Lane",
  "West End Walnut Grove": "West End",
  "Catholic Montgomery": "Montgomery Catholic",
  "Berry Fayette": "Berry",
  "Hope Christian Academy": "Hope Christian",
  "Decatur Heritage Christian": "Decatur Heritage",
};

/**
 * Names that appear in more than one form and must be disambiguated by
 * classification + region rather than by string similarity alone.
 */
export const AMBIGUOUS_BASES: Record<string, string[]> = {
  central: [
    "Central-Hayneville",
    "Central-Coosa",
    "Central-Tuscaloosa",
    "Central-Clay County",
    "Central-Florence",
    "Central-Phenix City",
  ],
  hillcrest: ["Hillcrest-Evergreen", "Hillcrest-Tuscaloosa"],
  southside: ["Southside-Gadsden", "Southside-Selma"],
  lee: ["Lee-Huntsville", "Lee-Scott"],
  carver: ["Carver-Birmingham", "Carver-Montgomery"],
};

const SUFFIX_PATTERNS = [
  /\s+senior high school$/,
  /\s+catholic high school$/,
  /\s+episcopal school$/,
  /\s+christian school$/,
  /\s+christian academy$/,
  /\s+middle high school$/,
  /\s+high school$/,
  /\s+catholic school$/,
  /\s+bible school$/,
  /\s+charter school$/,
  /\s+prep school$/,
  /\s+academy$/,
  /\s+school$/,
  /\s+hs$/,
];

/** Lowercase, strip punctuation and state tags, collapse whitespace. */
export function normalize(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/\((?:fl|ga|ms|tn|la|al)\)/g, " ") // state tags
      .replace(/&/g, " and ")
      .replace(/[.'’,]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      // "HS" anywhere, not just trailing. The results sheets write
      // "Central HS, Phenix City", where suffix stripping cannot reach it.
      // No roster name contains "hs" as a word.
      .replace(/\bhs\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Every shortened form reachable by stripping suffixes, longest first.
 *
 * This explores all applicable patterns rather than greedily taking the first
 * that matches. "Hope Christian Academy" must yield "hope christian" (the
 * roster spelling) as well as "hope" — a greedy stripper removes the whole
 * "christian academy" tail and never produces the form we actually need.
 */
function variants(raw: string): string[] {
  const start = normalize(raw);
  const seen = new Set<string>([start]);
  const queue = [start];

  while (queue.length) {
    const cur = queue.shift() as string;
    for (const p of SUFFIX_PATTERNS) {
      const next = cur.replace(p, "").trim();
      if (next && next !== cur && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  // Longest first, so the most specific form is tried before the vaguest.
  return [...seen].sort((a, b) => b.length - a.length);
}

// ---- similarity -----------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// ---- the matcher ----------------------------------------------------------

export type MatchMethod =
  | "alias"
  | "exact"
  | "suffix"
  | "class-region"
  | "fuzzy"
  | "out-of-state"
  | "unmatched";

export interface MatchResult {
  /** Canonical roster name, or the cleaned raw name when out-of-state. */
  name: string | null;
  method: MatchMethod;
  confidence: number;
  /** True when the school is not an AHSAA member (counts for record only). */
  outOfState: boolean;
  raw: string;
  /** Set when a match needs a human to confirm it. */
  note?: string;
}

export interface MatcherIndex {
  byNormalized: Map<string, Team[]>;
  byName: Map<string, Team>;
  teams: Team[];
}

export function buildIndex(teams: Team[]): MatcherIndex {
  const byNormalized = new Map<string, Team[]>();
  const byName = new Map<string, Team>();
  for (const t of teams) {
    byName.set(t.name, t);
    for (const v of variants(t.name)) {
      const list = byNormalized.get(v) ?? [];
      // Longest variant wins insertion order; duplicates flag ambiguity.
      if (!list.includes(t)) list.push(t);
      byNormalized.set(v, list);
    }
  }
  return { byNormalized, byName, teams };
}

export interface MatchInput {
  raw: string;
  classToken?: string;
  regionToken?: string;
  /** Extra aliases resolved by an admin previously. */
  extraAliases?: Record<string, string>;
  /** Admin-maintained non-members, normalized by `nonMemberSet`. */
  nonMembers?: Set<string>;
}

export function matchTeam(
  input: MatchInput,
  index: MatcherIndex,
): MatchResult {
  const raw = input.raw.trim().replace(/\s+/g, " ");
  const base: Omit<MatchResult, "name" | "method" | "confidence"> = {
    outOfState: false,
    raw,
  };

  if (!raw) {
    return { ...base, name: null, method: "unmatched", confidence: 0 };
  }

  // Out-of-state and non-championship schools: recorded against the
  // opponent's record but never given a rating of their own. The engine
  // values them off the field mean.
  if (
    (input.classToken && isOutOfStateToken(input.classToken)) ||
    isNonMember(raw, input.nonMembers) ||
    hasOutOfStateSuffix(raw)
  ) {
    return {
      ...base,
      name: cleanOosName(raw),
      method: "out-of-state",
      confidence: 1,
      outOfState: true,
    };
  }

  // 1. explicit aliases (admin-resolved ones take precedence)
  //
  // Matched on the normalized form as well as verbatim: the alias table was
  // written against the schedule sheets ("Johnson-Abernathy-Graetz HS") and
  // the results sheets spell the same school differently ("Johnson Abernathy
  // Graetz"). Both reduce to the same normalized string.
  const alias =
    input.extraAliases?.[raw] ??
    ALIASES[raw] ??
    normalizedAlias(input.extraAliases)[normalize(raw)] ??
    NORMALIZED_ALIASES[normalize(raw)];
  if (alias && index.byName.has(alias)) {
    return { ...base, name: alias, method: "alias", confidence: 1 };
  }

  const forms = variants(raw);

  // 2. exact normalized, unambiguous
  const exact = index.byNormalized.get(forms[0]);
  if (exact?.length === 1) {
    return { ...base, name: exact[0].name, method: "exact", confidence: 1 };
  }

  // 4a. ambiguity on the full form — resolve by class + region
  if (exact && exact.length > 1) {
    const picked = disambiguate(exact, input);
    if (picked) {
      return {
        ...base,
        name: picked.name,
        method: "class-region",
        confidence: 0.8,
        note: `"${raw}" matched ${exact.length} schools; picked by class+region. Verify.`,
      };
    }
  }

  // 3. progressive suffix stripping
  for (const f of forms.slice(1)) {
    const hit = index.byNormalized.get(f);
    if (hit?.length === 1) {
      return { ...base, name: hit[0].name, method: "suffix", confidence: 0.95 };
    }
    if (hit && hit.length > 1) {
      const picked = disambiguate(hit, input);
      if (picked) {
        return {
          ...base,
          name: picked.name,
          method: "class-region",
          confidence: 0.8,
          note: `"${raw}" matched ${hit.length} schools; picked by class+region. Verify.`,
        };
      }
    }
  }

  // 4b. known ambiguous bases ("Lee High School", "Southside High School")
  const head = forms[forms.length - 1];
  const candidates = AMBIGUOUS_BASES[head];
  if (candidates) {
    const pool = candidates
      .map((n) => index.byName.get(n))
      .filter((t): t is Team => Boolean(t));
    const picked = disambiguate(pool, input);
    if (picked) {
      return {
        ...base,
        name: picked.name,
        method: "class-region",
        confidence: 0.8,
        note: `"${raw}" is ambiguous; picked by class+region. Verify.`,
      };
    }
  }

  // 5. fuzzy
  let best: { team: Team; score: number } | null = null;
  for (const t of index.teams) {
    for (const tv of variants(t.name)) {
      for (const f of forms) {
        const s = similarity(f, tv);
        if (!best || s > best.score) best = { team: t, score: s };
      }
    }
  }
  if (best && best.score >= 0.86) {
    return {
      ...base,
      name: best.team.name,
      method: "fuzzy",
      confidence: best.score,
      note: `Fuzzy match (${(best.score * 100).toFixed(0)}%) for "${raw}". Verify.`,
    };
  }

  return {
    ...base,
    name: null,
    method: "unmatched",
    confidence: 0,
    note: `No roster match for "${raw}". Add an alias or create the team.`,
  };
}

function disambiguate(pool: Team[], input: MatchInput): Team | null {
  if (pool.length === 1) return pool[0];
  const cls = input.classToken ? normalizeClassToken(input.classToken) : null;
  const reg = input.regionToken ? parseRegionToken(input.regionToken) : null;

  if (cls) {
    const byCls = pool.filter((t) => t.classification === cls);
    if (byCls.length === 1) return byCls[0];
    if (byCls.length > 1 && reg !== null) {
      const byReg = byCls.filter((t) => t.region === reg);
      if (byReg.length === 1) return byReg[0];
    }
  }
  // Region alone, when the class token is a known-bad value.
  if (reg !== null) {
    const byReg = pool.filter((t) => t.region === reg);
    if (byReg.length === 1) return byReg[0];
  }
  return null;
}

/** Tidies an out-of-state school name for display and storage. */
export function cleanOosName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.replace(/\s+(HS|High School)$/i, "");
  // "Northside - Columbus GA)" and similar unbalanced parens in the PDFs
  s = s.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ").trim();
  if ((s.match(/\)/g)?.length ?? 0) > (s.match(/\(/g)?.length ?? 0)) {
    s = s.replace(/\)/, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The alias table keyed by normalized name.
 *
 * Built once. The same school reaches us spelled several ways across the
 * AHSAA's own documents, and every one of them reduces to the same normalized
 * string — so one entry covers all of them rather than needing a row each.
 */
const NORMALIZED_ALIASES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  const ambiguous = new Set<string>();
  for (const [source, canonical] of Object.entries(ALIASES)) {
    // Every shortened form, so "A.P. Brewer HS" reaches an entry written as
    // "A.P. Brewer High School" — the two only meet once suffixes are gone.
    for (const form of variants(source)) {
      if (out[form] && out[form] !== canonical) ambiguous.add(form);
      out[form] = canonical;
    }
  }
  // "Central High School, Hayneville" shortens to plain "central", which
  // several schools share. A form that maps to more than one canonical name
  // is no evidence at all, so it is dropped and left to class+region.
  for (const form of ambiguous) delete out[form];
  return out;
})();

/** The same treatment for aliases an admin resolved, memoised per object. */
const normalizedCache = new WeakMap<object, Record<string, string>>();
function normalizedAlias(
  extra: Record<string, string> | undefined,
): Record<string, string> {
  if (!extra) return {};
  const hit = normalizedCache.get(extra);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const [source, canonical] of Object.entries(extra)) {
    out[normalize(source)] = canonical;
  }
  normalizedCache.set(extra, out);
  return out;
}
