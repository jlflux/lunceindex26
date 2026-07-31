import TeamsManager from "@/components/admin/TeamsManager";
import { loadTeams } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  return <TeamsManager initial={await loadTeams(true)} />;
}
