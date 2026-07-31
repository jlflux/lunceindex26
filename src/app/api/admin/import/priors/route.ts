import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { parseCsvText } from "@/lib/csv";
import { loadAliases, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { buildIndex, matchTeam } from "@/lib/names";

/**
 * Bulk import of preseason carry-over ratings.
 *
 * Names run through the same matcher as everything else, since 2025 team
 * names differ from 2026 roster names in several places.
 */
interface PriorRow {
  raw: string;
  name: string | null;
  rating: number | null;
  source: string;
  error: string | null;
  warning: string | null;
}

const NAME_HEADERS = ["team", "name", "school"];
const RATING_HEADERS = [
  "rating",
  "prior",
  "preseason_prior",
  "preseason prior",
  "final",
  "final rating",
];

function build(rows: string[][], teams: Awaited<ReturnType<typeof loadTeams>>, aliases: Record<string, string>): PriorRow[] {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iName = header.findIndex((h) => NAME_HEADERS.includes(h));
  const iRating = header.findIndex((h) => RATING_HEADERS.includes(h));
  if (iName < 0 || iRating < 0) {
    throw new Error(
      `CSV needs a team-name column and a rating column. Found: ${rows[0].join(", ")}`,
    );
  }

  const index = buildIndex(teams);

  return rows.slice(1).flatMap<PriorRow>((r) => {
    const raw = (r[iName] ?? "").trim();
    if (!raw) return [];
    const rating = Number((r[iRating] ?? "").trim());
    const m = matchTeam({ raw, extraAliases: aliases }, index);

    let error: string | null = null;
    if (!Number.isFinite(rating)) error = "Rating is not a number.";
    else if (!m.name || m.outOfState) error = `No roster match for "${raw}".`;

    return [
      {
        raw,
        name: m.outOfState ? null : m.name,
        rating: Number.isFinite(rating) ? rating : null,
        source: raw,
        error,
        warning: error ? null : (m.note ?? null),
      },
    ];
  });
}

/** Dry run. */
export const POST = withAdmin(async (req: Request) => {
  const { csv } = (await req.json()) as { csv?: string };
  if (!csv?.trim()) throw new Error("Paste or upload a CSV first.");

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
  const rows = build(parseCsvText(csv), teams, aliases);

  const matchedNames = new Set(rows.filter((r) => !r.error).map((r) => r.name));
  const missing = teams
    .filter((t) => !matchedNames.has(t.name))
    .map((t) => `${t.name} (${t.classification})`);

  return NextResponse.json({
    ok: true,
    rows,
    matched: rows.filter((r) => !r.error).length,
    errors: rows.filter((r) => r.error).length,
    warnings: rows.filter((r) => !r.error && r.warning).length,
    // Teams left without a prior fall back to their class baseline.
    missingTeams: missing,
  });
});

/** Commits the confirmed rows. */
export const PUT = withAdmin(async (req: Request) => {
  const { rows } = (await req.json()) as { rows?: PriorRow[] };
  const good = (rows ?? []).filter((r) => !r.error && r.name && r.rating !== null);
  if (!good.length) throw new Error("Nothing to import.");

  const db = serviceClient();
  let updated = 0;
  for (const r of good) {
    const { error } = await db
      .from("teams")
      .update({ preseason_prior: r.rating, prior_source: r.source })
      .eq("name", r.name as string);
    if (error) throw new Error(error.message);
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
});
