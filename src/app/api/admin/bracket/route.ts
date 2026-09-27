import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { sizeOf } from "@/lib/bracket";
import {
  emptyBracketState,
  STATUS_KEYS,
  type BracketState,
  type ClassState,
  type GameEditorial,
  type RegionState,
  type Slot,
  type StatusKey,
} from "@/lib/bracket-types";
import { loadBracket, saveBracket } from "@/lib/data";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

export const runtime = "nodejs";

export const GET = withAdmin(async () => {
  return NextResponse.json({ ok: true, state: await loadBracket(true) });
});

const str = (v: unknown, max = 20000): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Replaces the whole document.
 *
 * A full replace rather than per-field patches, for the same reason the
 * composite editor works that way: the thing being edited is a shape. Clearing
 * a pin, emptying a note and moving a seed are all removals, and a
 * patch-per-field API cannot say "this is gone".
 *
 * Everything is re-validated here rather than trusted from the client. The
 * editor is the only thing that posts to it today, but "the only caller is
 * ours" is not a property that survives contact with a second caller.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as { state?: unknown };
  const raw = body.state as Partial<BracketState> | undefined;
  if (!raw || typeof raw !== "object") throw new Error("Expected a bracket state.");

  const before = await loadBracket(true);
  const state: BracketState = emptyBracketState(str(raw.season, 40) || "2026");
  state.newsNote = str(raw.newsNote, 4000);
  state.aboutHtml = str(raw.aboutHtml, 60000);
  state.aboutBanner = {
    enabled: (raw.aboutBanner as { enabled?: unknown } | undefined)?.enabled === true,
    text: str((raw.aboutBanner as { text?: unknown } | undefined)?.text, 300),
  };
  state.showProjections = raw.showProjections === true;

  for (const cls of CLS_FILTER_ORDER) {
    const incoming = (raw.classes as Record<string, unknown> | undefined)?.[cls] as
      | Partial<ClassState>
      | undefined;
    if (!incoming) continue;

    const slots: Slot[] = Array.isArray(incoming.slots)
      ? incoming.slots.map((s) => {
          const o = s as { region?: unknown; place?: unknown } | null;
          if (!o) return null;
          const region = Number(o.region);
          const place = Number(o.place);
          if (!Number.isInteger(region) || region < 1 || region > 8) return null;
          if (!Number.isInteger(place) || place < 1 || place > 16) return null;
          return { region, place };
        })
      : [];

    // Game ids are positional, so a change of size re-points every stored
    // kickoff time and projection onto a different match-up. Refuse it rather
    // than silently rewriting a season's worth of notes onto the wrong games.
    const was = sizeOf(before, cls);
    if (was && slots.length && slots.length !== was) {
      throw new Error(
        `Class ${cls} has ${was} slots and the save has ${slots.length}. ` +
          `Game ids are positional, so resizing would move every stored date ` +
          `and projection onto a different match-up.`,
      );
    }
    if (slots.length && (slots.length & (slots.length - 1)) !== 0) {
      throw new Error(`Class ${cls}: ${slots.length} slots is not a power of two.`);
    }

    const results: Record<string, GameEditorial> = {};
    for (const [id, v] of Object.entries(incoming.results ?? {})) {
      const o = v as Record<string, unknown>;
      const e: GameEditorial = {};
      if (o.home === "top" || o.home === "bottom") e.home = o.home;
      for (const k of ["date", "time", "location", "note"] as const) {
        const t = str(o[k], k === "note" ? 2000 : 120).trim();
        if (t) e[k] = t;
      }
      if (Object.keys(e).length) results[id] = e;
    }

    const projected: Record<string, "top" | "bottom"> = {};
    for (const [id, v] of Object.entries(incoming.projected ?? {})) {
      if (v === "top" || v === "bottom") projected[id] = v;
    }

    const regions: Record<string, RegionState> = {};
    for (const [rid, v] of Object.entries(incoming.regions ?? {})) {
      const o = v as Partial<RegionState>;
      const rs: RegionState = { note: str(o.note, 4000).trim() };
      if (Array.isArray(o.order) && o.order.length) {
        rs.order = o.order.map((n) => str(n, 120)).filter(Boolean);
      }
      const status: Record<string, StatusKey> = {};
      for (const [team, key] of Object.entries(o.status ?? {})) {
        if ((STATUS_KEYS as readonly string[]).includes(key as string)) {
          status[str(team, 120)] = key as StatusKey;
        }
      }
      if (Object.keys(status).length) rs.status = status;
      if (rs.note || rs.order || rs.status) regions[rid] = rs;
    }

    state.classes[cls as Classification] = {
      alignment: Array.isArray(incoming.alignment)
        ? incoming.alignment.map(Number).filter(Number.isFinite)
        : [],
      slots,
      results,
      projected,
      regions,
    };
  }

  await saveBracket(state);

  const pinned = CLS_FILTER_ORDER.flatMap((c) =>
    Object.entries(state.classes[c]?.regions ?? {})
      .filter(([, r]) => r.order?.length)
      .map(([rid]) => `${c} R${rid}`),
  );

  return NextResponse.json({ ok: true, pinned });
});
