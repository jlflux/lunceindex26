import AdminError from "@/components/admin/AdminError";
import AswaEditor from "@/components/admin/AswaEditor";
import { loadRatings } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "ASWA Poll" };

export default async function AdminAswaPage() {
  try {
    // Records come off the published board so the poll's W-L does not have to
    // be retyped; the editor still lets them be overridden.
    const data = await loadRatings();
    const records: Record<string, string> = {};
    for (const r of data.ratings) records[r.name] = `${r.wins}-${r.losses}`;
    return <AswaEditor records={records} />;
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
