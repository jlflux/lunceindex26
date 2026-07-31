import GamesManager from "@/components/admin/GamesManager";
import { loadGames, loadTeams } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Games" };

export default async function GamesPage() {
  const [teams, games] = await Promise.all([loadTeams(true), loadGames(true)]);
  return (
    <GamesManager
      teamNames={teams.map((t) => t.name)}
      initialGames={games}
    />
  );
}
