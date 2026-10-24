import Link from "next/link";
import { notFound } from "next/navigation";
import BracketView from "@/components/bracket/BracketView";
import EmbedFrame from "@/components/EmbedFrame";
import { regionKey, resolveBracket, seededRegions } from "@/lib/bracket";
import { loadBracket, loadRatings } from "@/lib/data";
import { guardSection } from "@/lib/guard";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

export const revalidate = 300;

/**
 * One classification's bracket, on its own, for putting in an iframe.
 *
 * No nav, no footer, no page chrome — whatever wraps it belongs to whoever
 * embedded it. What it does keep is the line of attribution at the bottom,
 * because an embed that cannot be traced back is an embed that gets screen-
 * shotted and misattributed.
 *
 * Framing permission is granted in `next.config.mjs` for `/embed/*` and
 * nowhere else, so the rest of the site keeps whatever framing posture it
 * had.
 */
export function generateStaticParams() {
  return CLS_FILTER_ORDER.map((cls) => ({ cls }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cls: string }>;
}) {
  const { cls } = await params;
  return {
    title: `${decodeURIComponent(cls)} Bracket`,
    // An embed has no business in anyone's search results; the page it came
    // from is the one worth finding.
    robots: { index: false, follow: false },
  };
}

export default async function EmbedBracketPage({
  params,
  searchParams,
}: {
  params: Promise<{ cls: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  // An embed is still the bracketology section. Switching that off in the
  // admin has to take the embeds with it, or hiding a board from the site
  // would leave it on display somewhere else.
  await guardSection("/bracketology");

  const [{ cls: raw }, { theme }] = await Promise.all([params, searchParams]);
  const cls = decodeURIComponent(raw) as Classification;
  if (!CLS_FILTER_ORDER.includes(cls)) notFound();

  const [data, state] = await Promise.all([loadRatings(), loadBracket()]);
  const seeded = seededRegions(data.ratings, data.games, data.odds, state);
  const bracket = resolveBracket(state, cls, seeded, data.games);

  return (
    // Light unless asked otherwise: an embed lands in somebody else's page,
    // and the site's own dark default is the wrong guess there more often
    // than not. `?theme=dark` takes it back.
    <EmbedFrame theme={theme === "dark" ? "dark" : "light"}>
      {bracket ? (
        <BracketView bracket={bracket} linkTeams={false} />
      ) : (
        <p
          className="px-4 py-10 text-center text-sm"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          The {cls} bracket has not been laid out yet.
        </p>
      )}

      <div
        className="mt-3 flex items-center justify-between gap-3 border-t pt-2.5 text-[11px]"
        style={{
          borderColor: "rgb(var(--border))",
          color: "rgb(var(--text-faint))",
        }}
      >
        <span className="font-semibold">Class {cls} · ALPreps Index</span>
        <Link
          href="/bracketology"
          target="_blank"
          className="font-semibold hover:underline"
          style={{ color: "rgb(var(--brand))" }}
        >
          Full bracketology →
        </Link>
      </div>
    </EmbedFrame>
  );
}
