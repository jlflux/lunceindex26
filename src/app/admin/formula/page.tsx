import FormulaEditor from "@/components/admin/FormulaEditor";
import { loadConfig } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formula" };

export default async function FormulaPage() {
  return <FormulaEditor initial={await loadConfig(true)} />;
}
