import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import {
  DEFAULT_ANCHOR,
  ahsfhsCandidates,
  ahsfhsUrl,
  parseAhsfhsTeamPage,
  sectionHeadings,
  type AhsfhsPage,
} from "@/lib/ahsfhs";
import { loadAliases, loadNonMembers, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { buildIndex, matchTeam, nonMemberSet } from "@/lib/names";
import type { Game, Team } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Weeks 0–10 are the regular season; anything later is a playoff round. */
const REGULAR_SEASON_LAST_WEEK = 10;

interface Row {
  home: string;
  away: string;
  week: number;
  date: string | null;
  /** Which source team's page this came from, for the report. */
  source: string;
  homeOk: boolean;
  awayOk: boolean;
  note: string | null;
  /** Null until the game has been played. Oriented to home/away, not source. */
  homeScore: number | null;
  awayScore: number | null;
}

/** Turns one team's page into oriented home/away rows. */
function rowsFromPage(
  page: AhsfhsPage,
  sourceTeam: Team,
  index: ReturnType<typeof buildIndex>,
  aliases: Record<string, string>,
  nonMembers?: Set<string>,
): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [];
  const problems: string[] = [];

  for (const g of page.games) {
    if (g.week === null) {
      problems.push(`${sourceTeam.name}: ${g.dateLabel} is outside the season`);
      continue;
    }

    // Everything imported here is written as a regular-season game. Once the
    // brackets are up, a November fixture would otherwise land as regular
    // week 12 — no playoff multiplier, and counted as regular season in the
    // ratings. Reported instead, to be entered with its round by hand.
    if (g.week > REGULAR_SEASON_LAST_WEEK) {
      problems.push(
        `${sourceTeam.name}: ${g.dateLabel} vs ${g.opponentRaw} is past week ` +
          `${REGULAR_SEASON_LAST_WEEK} — enter playoff games by hand so the round is right`,
      );
      continue;
    }

    const m = matchTeam(
      { raw: g.opponentRaw, extraAliases: aliases, nonMembers },
      index,
    );
    if (!m.name) {
      // AISA and defunct programs live on this site alongside AHSAA members,
      // so an unmatched name is expected rather than an error.
      problems.push(
        `${sourceTeam.name}: no roster match for "${g.opponentRaw}" (wk ${g.week})`,
      );
      continue;
    }

    // The page reports from its own team's side; the row is stored home-first.
    const played = g.teamScore !== null && g.oppScore !== null;
    rows.push({
      home: g.isHome ? sourceTeam.name : m.name,
      away: g.isHome ? m.name : sourceTeam.name,
      week: g.week,
      date: g.date,
      source: sourceTeam.name,
      homeOk: true,
      awayOk: true,
      note: m.outOfState ? `${m.name} is non-AHSAA` : m.note ?? null,
      homeScore: !played ? null : g.isHome ? g.teamScore : g.oppScore,
      awayScore: !played ? null : g.isHome ? g.oppScore : g.teamScore,
    });
  }
  return { rows, problems };
}

/**
 * Dry run over uploaded page HTML. Accepts one or many files so a whole
 * roster's worth can be checked before anything is written.
 */
export const POST = withAdmin(async (req: Request) => {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new Error("Attach at least one saved team page.");

  const [teams, aliases, nonMemberNames] = await Promise.all([
    loadTeams(true),
    loadAliases(),
    loadNonMembers(),
  ]);
  const nonMembers = nonMemberSet(nonMemberNames);
  const index = buildIndex(teams);
  const byName = new Map(teams.map((t) => [t.name, t]));

  const rows: Row[] = [];
  const problems: string[] = [];

  for (const file of files) {
    const html = await file.text();
    const page = parseAhsfhsTeamPage(html, DEFAULT_ANCHOR);

    // The page names its own team; match it to the roster like any other.
    const self = page.team
      ? matchTeam({ raw: page.team, extraAliases: aliases, nonMembers }, index)
      : null;
    const sourceTeam = self?.name ? byName.get(self.name) : undefined;

    if (!sourceTeam) {
      problems.push(
        `${file.name}: could not identify the team (read "${page.team ?? "nothing"}")`,
      );
      continue;
    }

    const out = rowsFromPage(page, sourceTeam, index, aliases, nonMembers);
    rows.push(...out.rows);
    problems.push(...out.problems);
    for (const s of page.skipped) {
      problems.push(`${sourceTeam.name}: ${s.reason} ${s.text}`.trim());
    }
  }

  // The same fixture appears on both teams' pages; orientation makes the key
  // identical, so collapsing here mirrors what the upsert would do anyway.
  // Both teams list the fixture, but only one side may have its score posted
  // yet — so a scored copy replaces an unscored one rather than losing to it.
  const seen = new Map<string, number>();
  const unique: Row[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const key = `${r.home}|${r.away}|${r.week}`;
    const at = seen.get(key);
    if (at !== undefined) {
      duplicates++;
      if (unique[at].homeScore === null && r.homeScore !== null) unique[at] = r;
      continue;
    }
    seen.set(key, unique.length);
    unique.push(r);
  }

  return NextResponse.json({
    ok: true,
    files: files.length,
    games: unique,
    duplicates,
    problems: [...new Set(problems)],
  });
});

/** Rows written per request. Keeps any one statement well inside limits. */
const WRITE_CHUNK = 400;

/** Commits the confirmed rows. Existing scores are never disturbed. */
export const PUT = withAdmin(async (req: Request) => {
  const { games } = (await req.json()) as { games?: Row[] };
  const rows = games ?? [];
  if (!rows.length) throw new Error("Nothing to import.");

  const db = serviceClient();

  // Paged. A plain select stops at 1000 rows, and any game past that would
  // then look unplayed — so a re-import would blank scores already entered.
  const existing: Game[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("games")
      .select("t1, t2, week, type, s1, s2")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    existing.push(...((data ?? []) as Game[]));
    if (!data || data.length < 1000) break;
  }

  const onFile = new Map<string, Game>();
  for (const g of existing) {
    onFile.set(`${g.t1}|${g.t2}|${g.week}|${g.type}`, g);
  }

  // Deduplicate on the real conflict key. Postgres rejects an ON CONFLICT
  // statement that would touch the same row twice, which fails the whole
  // batch — so two source pages disagreeing about nothing but the date must
  // not both reach the upsert. A scored copy wins over an unscored one.
  const byKey = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.home}|${r.away}|${r.week}|regular`;
    const held = byKey.get(key);
    if (!held || (held.homeScore === null && r.homeScore !== null)) {
      byKey.set(key, r);
    }
  }

  const conflicts: string[] = [];
  let scored = 0;
  let unchanged = 0;

  const toWrite: Record<string, unknown>[] = [];
  for (const [key, r] of byKey) {
    const current = onFile.get(key);
    const hasScore = r.homeScore !== null && r.awayScore !== null;
    const held = current && current.s1 !== null && current.s2 !== null;

    // A score already entered is never overwritten. If the source disagrees
    // it is reported for a human to settle — silently replacing a corrected
    // result with the one that was corrected away is the worse failure.
    if (held) {
      if (
        hasScore &&
        (current.s1 !== r.homeScore || current.s2 !== r.awayScore)
      ) {
        conflicts.push(
          `${r.home} ${current.s1}–${current.s2} ${r.away} (wk ${r.week}) — ahsfhs says ${r.homeScore}–${r.awayScore}`,
        );
      } else {
        unchanged++;
      }
      continue;
    }

    if (hasScore) scored++;
    toWrite.push({
      t1: r.home,
      t2: r.away,
      s1: r.homeScore,
      s2: r.awayScore,
      week: r.week,
      type: "regular" as const,
      round: null,
      date: r.date,
      status: hasScore ? "final" : "scheduled",
    });
  }

  // Chunked, so one oversized statement cannot take the whole import with it
  // and the count reported back is what actually landed.
  let written = 0;
  for (let i = 0; i < toWrite.length; i += WRITE_CHUNK) {
    const slice = toWrite.slice(i, i + WRITE_CHUNK);
    const { error } = await db
      .from("games")
      .upsert(slice, { onConflict: "t1,t2,week,type" });
    if (error) {
      throw new Error(
        `${error.message} — ${written} of ${toWrite.length} games were written before this failed.`,
      );
    }
    written += slice.length;
  }

  const byWeek: Record<number, number> = {};
  for (const g of toWrite) {
    const w = g.week as number;
    byWeek[w] = (byWeek[w] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    received: rows.length,
    imported: written,
    scored,
    skippedAlreadyPlayed: unchanged,
    collapsed: rows.length - byKey.size,
    conflicts,
    byWeek,
  });
});

/**
 * One page, with a timeout so an unresponsive request cannot consume the whole
 * invocation, and one retry so a single slow response does not cost a team its
 * entire schedule — which is what happened to Cleburne County, whose page was
 * fine when visited by hand a minute later.
 */
async function fetchPage(url: string, attempts = 2): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, {
        headers: { "User-Agent": "ALPrepsIndex/1.0" },
        signal: controller.signal,
      });
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/**
 * Fetches one batch of team pages from ahsfhs.org.
 *
 * Deliberately batched rather than looping over all 393 in a single request:
 * a serverless invocation cannot stay alive long enough for that, and the
 * gateway kills it with an HTML error page rather than JSON. The client walks
 * the roster by offset and accumulates.
 *
 * Only usable where the deployment can reach the site — it works on Vercel but
 * not from every environment, which is why the upload path above exists.
 */
export const PATCH = withAdmin(async (req: Request) => {
  const {
    offset = 0,
    batch = 20,
    onlyMissing = false,
    diagnose,
  } = (await req.json()) as {
    offset?: number;
    batch?: number;
    onlyMissing?: boolean;
    diagnose?: string;
  };

  // Single-team read-only probe. Reports what the parser actually saw on the
  // live page — which headings exist, which candidate answered, every row it
  // recognised — because the site cannot be reached from a dev machine and a
  // page saved before the season does not necessarily match one saved during.
  if (diagnose) {
    const out: Record<string, unknown>[] = [];
    for (const candidate of ahsfhsCandidates(diagnose)) {
      try {
        const res = await fetchPage(ahsfhsUrl(candidate), 1);
        if (!res.ok) {
          out.push({ candidate, status: res.status });
          continue;
        }
        const html = await res.text();
        const parsed = parseAhsfhsTeamPage(html, DEFAULT_ANCHOR);
        out.push({
          candidate,
          status: res.status,
          bytes: html.length,
          pageTeam: parsed.team,
          season: parsed.season,
          headings: sectionHeadings(html),
          gameCount: parsed.games.length,
          games: parsed.games.map((g) => ({
            date: g.dateLabel,
            week: g.week,
            home: g.isHome,
            opponent: g.opponentRaw,
            result: g.result,
            score:
              g.teamScore === null ? null : `${g.teamScore}-${g.oppScore}`,
            // Verbatim, so a score layout that does not parse can be read off
            // the report rather than guessed at.
            resultCells: g.resultCells,
          })),
          skipped: parsed.skipped,
        });
        break;
      } catch (e) {
        out.push({
          candidate,
          error: e instanceof Error ? e.message : "fetch failed",
        });
      }
    }
    return NextResponse.json({ ok: true, diagnose, attempts: out });
  }

  const [teams, aliases, nonMemberNames] = await Promise.all([
    loadTeams(true),
    loadAliases(),
    loadNonMembers(),
  ]);
  const nonMembers = nonMemberSet(nonMemberNames);
  const index = buildIndex(teams);

  let roster = teams;
  if (onlyMissing) {
    const db = serviceClient();
    const { data: existingGames } = await db.from("games").select("t1, t2");
    const have = new Set<string>();
    for (const g of (existingGames ?? []) as { t1: string; t2: string }[]) {
      have.add(g.t1);
      have.add(g.t2);
    }
    roster = teams.filter((t) => !have.has(t.name));
  }

  const slice = roster.slice(offset, offset + batch);
  const rows: Row[] = [];
  const problems: string[] = [];
  let fetched = 0;
  let processed = 0;

  // Leaves room inside maxDuration to serialise and return what we have. The
  // client walks by nextOffset, so stopping early costs a round trip, not data.
  const deadline = Date.now() + 45_000;

  for (const t of slice) {
    if (Date.now() > deadline) break;
    processed++;
    // The two lists spell punctuation differently — hyphens for spaces,
    // "BB Comer" for "B.B. Comer" — so a miss is retried with the next
    // plausible spelling rather than reported. A team we already spell their
    // way resolves on the first candidate and costs one request.
    const candidates = ahsfhsCandidates(t.name);
    const tried: string[] = [];
    let page: AhsfhsPage | null = null;

    for (const candidate of candidates) {
      tried.push(candidate);
      try {
        const res = await fetchPage(ahsfhsUrl(candidate));
        if (!res.ok) continue;

        const parsed = parseAhsfhsTeamPage(await res.text(), DEFAULT_ANCHOR);
        // Keep the first page that answered, so a spelling that resolves to a
        // page without a current season still gets reported rather than
        // vanishing. Prefer any candidate that actually carries a schedule.
        page ??= parsed;
        if (parsed.games.length) {
          page = parsed;
          break;
        }
      } catch (e) {
        problems.push(
          `${t.name}: ${e instanceof Error ? e.message : "fetch failed"}`,
        );
      }
    }

    if (!page) {
      problems.push(
        `${t.name}: no page found — tried ${tried
          .map((c) => `"${c}"`)
          .join(", ")}`,
      );
      continue;
    }

    const out = rowsFromPage(page, t, index, aliases, nonMembers);
    rows.push(...out.rows);
    problems.push(...out.problems);
    fetched++;
  }

  const nextOffset = offset + processed;
  return NextResponse.json({
    ok: true,
    fetched,
    attempted: processed,
    offset,
    nextOffset,
    total: roster.length,
    done: nextOffset >= roster.length,
    games: rows,
    problems: [...new Set(problems)],
  });
});
