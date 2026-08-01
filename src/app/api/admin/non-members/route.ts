import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadNonMembers } from "@/lib/data";
import { serviceClient } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Schools that play AHSAA opponents without holding a rating: independents,
 * AISA programs, anyone off the classification list.
 *
 * They are not rows in `teams` — the engine values any name it cannot find
 * there off the field mean, so absence from `teams` is what makes a school
 * out-of-state. This list exists so the importer can tell a real independent
 * apart from a misspelling, and bring its games in rather than skipping them.
 */
export const GET = withAdmin(async () => {
  return NextResponse.json({ ok: true, names: await loadNonMembers() });
});

export const POST = withAdmin(async (req: Request) => {
  const { name, note } = (await req.json()) as { name?: string; note?: string };
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("A name is required.");

  const { error } = await serviceClient()
    .from("non_members")
    .upsert({ name: clean, note: note?.trim() || null }, { onConflict: "name" });
  if (error) {
    throw new Error(
      `${error.message} — if the table is missing, run supabase/migrations/002_non_members.sql.`,
    );
  }
  return NextResponse.json({ ok: true, name: clean });
});

export const DELETE = withAdmin(async (req: Request) => {
  const { name } = (await req.json()) as { name?: string };
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("A name is required.");

  const { error } = await serviceClient()
    .from("non_members")
    .delete()
    .eq("name", clean);
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});
