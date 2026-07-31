import AdminError from "@/components/admin/AdminError";
import TeamsManager from "@/components/admin/TeamsManager";
import { loadTeams } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  try {
    return <TeamsManager initial={await loadTeams(true)} />;
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
