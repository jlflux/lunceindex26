import AdminError from "@/components/admin/AdminError";
import NonMemberList from "@/components/admin/NonMemberList";
import TeamsManager from "@/components/admin/TeamsManager";
import { loadTeams } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  try {
    return (
      <div className="space-y-8">
        <TeamsManager initial={await loadTeams(true)} />
        <NonMemberList />
      </div>
    );
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
