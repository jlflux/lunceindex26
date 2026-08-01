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
import { loadAliases, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { buildIndex, matchTeam } from "@/lib/names";
import type { Game, Team } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
}

/** Turns one team's page into oriented home/away rows. */
function rowsFromPage(
  page: AhsfhsPage,
  sourceTeam: Team,
  index: ReturnType<typeof buildIndex>,
  aliases: Record<string, string>,
): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [];
  const problems: string[] = [];

  for (const g of page.games) {
    if (g.week === null) {
      problems.push(`${sourceTeam.name}: ${g.dateLabel} is outside the season`);
      continue;
    }

    const m = matchTeam({ raw: g.opponentRaw, extraAliases: aliases }, index);
    if (!m.name) {
      // AISA and defunct programs live on this site alongside AHSAA members,
      // so an unmatched name is expected rather than an error.
      problems.push(
        `${sourceTeam.name}: no roster match for "${g.opponentRaw}" (wk ${g.week})`,
      );
      continue;
    }

    rows.push({
      home: g.isHome ? sourceTeam.name : m.name,
      away: g.isHome ? m.name : sourceTeam.name,
      week: g.week,
      date: g.date,
      source: sourceTeam.name,
      homeOk: true,
      awayOk: true,
      note: m.outOfState ? `${m.name} is non-AHSAA` : m.note ?? null,
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

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
  const index = buildIndex(teams);
  const byName = new Map(teams.map((t) => [t.name, t]));

  const rows: Row[] = [];
  const problems: string[] = [];

  for (const file of files) {
    const html = await file.text();
    const page = parseAhsfhsTeamPage(html, DEFAULT_ANCHOR);

    // The page names its own team; match it to the roster like any other.
    const self = page.team
      ? matchTeam({ raw: page.team, extraAliases: aliases }, index)
      : null;
    const sourceTeam = self?.name ? byName.get(self.name) : undefined;

    if (!sourceTeam) {
      problems.push(
        `${file.name}: could not identify the team (read "${page.team ?? "nothing"}")`,
      );
      continue;
    }

    const out = rowsFromPage(page, sourceTeam, index, aliases);
    rows.push(...out.rows);
    problems.push(...out.problems);
    for (const s of page.skipped) {
      problems.push(`${sourceTeam.name}: ${s.reason} ${s.text}`.trim());
    }
  }

  // The same fixture appears on both teams' pages; orientation makes the key
  // identical, so collapsing here mirrors what the upsert would do anyway.
  const seen = new Set<string>();
  const unique: Row[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const key = `${r.home}|${r.away}|${r.week}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
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

  const played = new Set(
    existing
      .filter((g) => g.s1 !== null && g.s2 !== null)
      .map((g) => `${g.t1}|${g.t2}|${g.week}|${g.type}`),
  );

  // Deduplicate on the real conflict key. Postgres rejects an ON CONFLICT
  // statement that would touch the same row twice, which fails the whole
  // batch — so two source pages disagreeing about nothing but the date must
  // not both reach the upsert.
  const byKey = new Map<string, Row>();
  let alreadyPlayed = 0;
  for (const r of rows) {
    const key = `${r.home}|${r.away}|${r.week}|regular`;
    if (played.has(key)) {
      alreadyPlayed++;
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, r);
  }

  const toWrite = [...byKey.values()].map((r) => ({
    t1: r.home,
    t2: r.away,
    s1: null,
    s2: null,
    week: r.week,
    type: "regular" as const,
    round: null,
    date: r.date,
    status: "scheduled",
  }));

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
  for (const g of toWrite) byWeek[g.week] = (byWeek[g.week] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    received: rows.length,
    imported: written,
    skippedAlreadyPlayed: alreadyPlayed,
    collapsed: rows.length - alreadyPlayed - toWrite.length,
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
            score:
              g.teamScore === null ? null : `${g.teamScore}-${g.oppScore}`,
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

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
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

    const out = rowsFromPage(page, t, index, aliases);
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
