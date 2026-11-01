import Link from "next/link";
import FormulaBoardPage from "@/components/boards/FormulaBoardPage";
import { SCHSL } from "@/lib/formula-boards";
import { loadRatings } from "@/lib/data";
import { guardSection } from "@/lib/guard";

export const revalidate = 300;
export const metadata = { title: "SCHSL" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** South Carolina's RPI, run on Alabama's field. */
export default async function SchslPage() {
  await guardSection("/schsl");
  const data = await loadRatings();

  return (
    <FormulaBoardPage
      data={data}
      spec={SCHSL}
      title="SCHSL Rankings"
      subtitle={
        <>
          The RPI the South Carolina High School League seeds its brackets
          with, run on the AHSAA field. {pct(SCHSL.weights.wp)} win percentage
          + {pct(SCHSL.weights.owp)} opponents&rsquo; win percentage +{" "}
          {pct(SCHSL.weights.oowp)} opponents&rsquo; opponents&rsquo; win
          percentage. Every win is worth one, wherever and whoever it came
          against — the most weight on your own record of the three boards
          here, and the least on the schedule behind it.
        </>
      }
      note={
        <>
          Against the{" "}
          <Link href="/psr" className="underline">
            PSR board
          </Link>
          , this is the same three figures five points further toward what a
          team did and away from who it played: for a team with no win over a
          school outside the association — the one figure the two boards read
          differently, fully here and at 0.9 there — SCHSL comes out exactly
          0.05 × (Win% − OWP) above PSR. As there, an opponent&rsquo;s
          win percentage is their whole record with the game against you left
          in, a tie counts half a win to both sides, and a game against a
          school outside the association stays in your record but out of the
          strength terms, because no record is held for it. Nothing on this
          page feeds the Index, the bracket or the playoff odds.
        </>
      }
    />
  );
}
