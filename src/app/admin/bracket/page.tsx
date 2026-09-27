import AdminError from "@/components/admin/AdminError";
import BracketEditor, {
  type EditorClass,
} from "@/components/admin/BracketEditor";
import { regionKey, resolveBracket, seededRegions } from "@/lib/bracket";
import { emptyBracketState } from "@/lib/bracket-types";
import { loadBracket, loadRatings } from "@/lib/data";
import { CLS_FILTER_ORDER } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bracketology" };

/**
 * Resolves each region twice — once as the season computes it and once as it
 * will actually be shown — so the editor can say what a pin is overriding.
 *
 * A pin is invisible to readers by request, which is exactly why it has to be
 * visible here: it is otherwise the kind of thing that gets set in September
 * and is still quietly in force in November.
 */
export default async function AdminBracketPage() {
  try {
    const [data, state] = await Promise.all([loadRatings(), loadBracket(true)]);

    const shown = seededRegions(data.ratings, data.games, data.odds, state);
    const computed = seededRegions(
      data.ratings,
      data.games,
      data.odds,
      emptyBracketState(),
    );

    const classes: EditorClass[] = [];
    for (const cls of CLS_FILTER_ORDER) {
      const field = data.ratings.filter((t) => t.classification === cls);
      if (!field.length) continue;
      const count = Math.max(...field.map((t) => t.region));

      const regions = [];
      for (let r = 1; r <= count; r++) {
        const list = shown.get(regionKey(cls, r)) ?? [];
        if (!list.length) continue;
        regions.push({
          region: r,
          shown: list,
          computed: computed.get(regionKey(cls, r)) ?? [],
        });
      }

      classes.push({
        classification: cls,
        regions,
        bracket: resolveBracket(state, cls, shown, data.games),
        bracketProjected: resolveBracket(state, cls, shown, data.games, {
          projected: true,
        }),
      });
    }

    return <BracketEditor initial={state} classes={classes} />;
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
