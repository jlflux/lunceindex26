import FormulaBoardPage from "@/components/boards/FormulaBoardPage";
import { PSR } from "@/lib/formula-boards";
import { loadRatings } from "@/lib/data";
import { guardSection } from "@/lib/guard";

export const revalidate = 300;
export const metadata = { title: "PSR" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Georgia's seeding formula, run on Alabama's field. */
export default async function PsrPage() {
  await guardSection("/psr");
  const data = await loadRatings();

  return (
    <FormulaBoardPage
      data={data}
      spec={PSR}
      title="PSR Rankings"
      subtitle={
        <>
          Post Season Ranking — the formula the GHSA seeds its Georgia brackets
          with, run on the AHSAA field. {pct(PSR.weights.wp)} win percentage +{" "}
          {pct(PSR.weights.owp)} opponents&rsquo; win percentage +{" "}
          {pct(PSR.weights.oowp)} opponents&rsquo; opponents&rsquo; win
          percentage. A win counts one wherever it was won — home, away or
          neutral — except over a school outside the association, which counts{" "}
          {PSR.winValue.nonMember}. Those games stay in your record and out of
          the strength terms, because no record is held for the school on the
          other side.
        </>
      }
      note={
        <>
          Two details the published formula leaves open, settled here the way
          the RPI board next door settles them: an opponent&rsquo;s win
          percentage is their whole record, with the game against you left in
          rather than taken out, and a tie counts half a win to both sides.
          Nothing on this page feeds the Index, the bracket or the playoff
          odds.
        </>
      }
    />
  );
}
