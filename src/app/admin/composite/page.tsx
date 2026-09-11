import AdminError from "@/components/admin/AdminError";
import CompositeEditor from "@/components/admin/CompositeEditor";
import { loadRatings } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Composite" };

export default async function AdminCompositePage() {
  try {
    // Our own rank and record come from the published board rather than being
    // typed in, so the Composite cannot quietly disagree with the Index.
    const data = await loadRatings();
    const ourRank: Record<string, number> = {};
    const ourRecord: Record<string, string> = {};
    for (const r of data.ratings) {
      ourRank[r.name] = r.rank;
      ourRecord[r.name] = `${r.wins}-${r.losses}`;
    }
    return <CompositeEditor ourRank={ourRank} ourRecord={ourRecord} />;
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
