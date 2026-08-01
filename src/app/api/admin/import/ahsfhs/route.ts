import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { DEFAULT_ANCHOR, ahsfhsUrl, parseAhsfhsTeamPage } from "@/lib/ahsfhs";
import { loadAliases, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { buildIndex, matchTeam } from "@/lib/names";
import type { Game, Team } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  html: string,
  sourceTeam: Team,
  index: ReturnType<typeof buildIndex>,
  aliases: Record<string, string>,
): { rows: Row[]; problems: string[] } {
  const page = parseAhsfhsTeamPage(html, DEFAULT_ANCHOR);
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

    const out = rowsFromPage(html, sourceTeam, index, aliases);
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

/** Commits the confirmed rows. Existing scores are never disturbed. */
export const PUT = withAdmin(async (req: Request) => {
  const { games } = (await req.json()) as { games?: Row[] };
  const rows = games ?? [];
  if (!rows.length) throw new Error("Nothing to import.");

  const db = serviceClient();
  const { data: existing, error: readErr } = await db
    .from("games")
    .select("t1, t2, week, type, s1, s2");
  if (readErr) throw new Error(readErr.message);

  const played = new Set(
    ((existing ?? []) as Game[])
      .filter((g) => g.s1 !== null && g.s2 !== null)
      .map((g) => `${g.t1}|${g.t2}|${g.week}|${g.type}`),
  );

  const toWrite = rows
    .filter((r) => !played.has(`${r.home}|${r.away}|${r.week}|regular`))
    .map((r) => ({
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

  if (toWrite.length) {
    const { error } = await db
      .from("games")
      .upsert(toWrite, { onConflict: "t1,t2,week,type" });
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({
    ok: true,
    imported: toWrite.length,
    skippedAlreadyPlayed: rows.length - toWrite.length,
  });
});

/**
 * Fetches pages directly from ahsfhs.org for every roster team.
 *
 * Only usable where the deployment can reach the site — it works on Vercel but
 * not from every environment, which is why the upload path above exists.
 * Requests are serialised with a small delay rather than fired in parallel.
 */
export const PATCH = withAdmin(async (req: Request) => {
  const { onlyMissing = true, limit = 400 } = (await req.json()) as {
    onlyMissing?: boolean;
    limit?: number;
  };

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
  const index = buildIndex(teams);

  const db = serviceClient();
  const { data: existingGames } = await db.from("games").select("t1, t2");
  const haveGames = new Set<string>();
  for (const g of (existingGames ?? []) as { t1: string; t2: string }[]) {
    haveGames.add(g.t1);
    haveGames.add(g.t2);
  }

  const targets = teams
    .filter((t) => !onlyMissing || !haveGames.has(t.name))
    .slice(0, limit);

  const rows: Row[] = [];
  const problems: string[] = [];
  let fetched = 0;

  for (const t of targets) {
    try {
      const res = await fetch(ahsfhsUrl(t.prior_source ?? t.name), {
        headers: { "User-Agent": "ALPrepsIndex/1.0" },
      });
      if (!res.ok) {
        problems.push(`${t.name}: HTTP ${res.status}`);
        continue;
      }
      const out = rowsFromPage(await res.text(), t, index, aliases);
      rows.push(...out.rows);
      problems.push(...out.problems);
      fetched++;
    } catch (e) {
      problems.push(
        `${t.name}: ${e instanceof Error ? e.message : "fetch failed"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r.home}|${r.away}|${r.week}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({
    ok: true,
    fetched,
    attempted: targets.length,
    games: unique,
    problems: [...new Set(problems)].slice(0, 200),
  });
});
