import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/admin-auth";
import { publishRatings } from "@/lib/data";

/** Recomputes ratings from current data and refreshes the public pages. */
export const POST = withAdmin(async () => {
  const payload = await publishRatings();

  revalidatePath("/");
  revalidatePath("/team/[slug]", "page");

  return NextResponse.json({
    ok: true,
    generated: payload.generated,
    teams: payload.ratings.length,
    gamesPlayed: payload.games.filter((g) => g.s1 !== null && g.s2 !== null)
      .length,
    maxWeekPlayed: payload.max_week_played,
    priorBlend: payload.prior_blend,
    top: payload.ratings.slice(0, 10).map((r) => ({
      rank: r.rank,
      name: r.name,
      classification: r.classification,
      rating: Number(r.rating.toFixed(2)),
      record: `${r.wins}-${r.losses}`,
    })),
  });
});
