import AdminError from "@/components/admin/AdminError";
import FormulaEditor from "@/components/admin/FormulaEditor";
import { loadConfig } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formula" };

export default async function FormulaPage() {
  try {
    return <FormulaEditor initial={await loadConfig(true)} />;
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }
}
