"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "./AdminShell";
import { Banner } from "./PublishButton";
import Icon from "@/components/Icon";
import {
  defaultHomeState,
  HOME_ICONS,
  HOME_STYLE_LABELS,
  HOME_STYLES,
  isExternal,
  isSafeHref,
  newId,
  SITE_PAGES,
  type HomeItem,
  type HomeSection,
  type HomeState,
  type HomeStyle,
} from "@/lib/home-types";
import type { IconName } from "@/components/Icon";

/**
 * The front page, as a form.
 *
 * Reordering is buttons rather than drag-and-drop on purpose. The bracket's
 * drag cost two rounds to get right — a frozen prop, then a browser that
 * reports a pass on a drag it never performed — and a list of four to six
 * rows gains nothing from it. Arrows work on a phone, which drag does not.
 *
 * Nothing here is live until Save. The editor holds one document and sends it
 * whole, the same as the bracket and the Composite.
 */
export default function HomeEditor() {
  const [state, setState] = useState<HomeState>(defaultHomeState());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/home");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load.");
        setState(body.state as HomeState);
      } catch (e) {
        setMsg({
          tone: "bad",
          text: e instanceof Error ? e.message : "Could not load.",
        });
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function editSection(i: number, fn: (s: HomeSection) => HomeSection) {
    setState((st) => ({
      ...st,
      sections: st.sections.map((s, j) => (j === i ? fn(s) : s)),
    }));
    setMsg(null);
  }

  function move<T>(list: T[], from: number, to: number): T[] {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      setMsg({
        tone: "good",
        text: `Saved ${body.links} link(s) across ${body.sections} group(s). The front page is updated.`,
      });
    } catch (e) {
      setMsg({
        tone: "bad",
        text: e instanceof Error ? e.message : "Save failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="card px-4 py-12 text-center text-sm" style={{ color: "rgb(var(--text-faint))" }}>
        Loading the front page…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Front page"
        subtitle="The headline, the announcement banner, and every group of links on the site's front page. Nothing changes until you press Save."
      />

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save front page"}
        </button>
        <a href="/" target="_blank" rel="noreferrer" className="btn !py-1.5 !text-xs">
          View the front page <Icon name="external" size={12} />
        </a>
        <button
          className="btn !py-1.5 !text-xs"
          style={{ color: "rgb(var(--bad))" }}
          onClick={() => {
            if (confirm("Put every heading, link and setting back the way the page shipped?\n\nNothing changes on the site until you press Save.")) {
              setState(defaultHomeState());
              setMsg({ tone: "good", text: "Reset. Press Save to apply it." });
            }
          }}
        >
          Reset to the original
        </button>
      </div>

      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}

      {/* ------------------------------------------------------- headline */}
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">Headline</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">First part</span>
            <input
              className="input"
              value={state.headline}
              placeholder="Alabama high school football,"
              onChange={(e) => setState((s) => ({ ...s, headline: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="label">
              Second part — shown in red
            </span>
            <input
              className="input"
              value={state.headlineAccent}
              placeholder="ranked and measured"
              onChange={(e) =>
                setState((s) => ({ ...s, headlineAccent: e.target.value }))
              }
            />
          </label>
        </div>

        <div
          className="rounded-lg border px-3 py-2.5"
          style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--surface-2))" }}
        >
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
            How it reads
          </span>
          <span className="text-[19px] font-extrabold leading-tight">
            {state.headline}
            {state.headlineAccent && (
              <>
                {state.headline ? " " : ""}
                <span style={{ color: "rgb(var(--brand))" }}>{state.headlineAccent}</span>
              </>
            )}
          </span>
        </div>

        <label className="block">
          <span className="label">The line underneath</span>
          <textarea
            className="input min-h-[70px] !text-[13px]"
            value={state.intro}
            onChange={(e) => setState((s) => ({ ...s, intro: e.target.value }))}
          />
        </label>

        <div className="flex flex-wrap gap-4">
          <Toggle
            checked={state.showSearch}
            onChange={(v) => setState((s) => ({ ...s, showSearch: v }))}
            label="Show the team search box"
          />
          <Toggle
            checked={state.showTopFive}
            onChange={(v) => setState((s) => ({ ...s, showTopFive: v }))}
            label="Show the top five"
          />
        </div>

        {state.showTopFive && (
          <label className="block sm:max-w-[320px]">
            <span className="label">Heading over the top five</span>
            <input
              className="input"
              value={state.topFiveLabel}
              onChange={(e) =>
                setState((s) => ({ ...s, topFiveLabel: e.target.value }))
              }
            />
          </label>
        )}
      </div>

      {/* --------------------------------------------------------- banner */}
      <div
        className="card space-y-3 p-4"
        style={{
          borderColor: state.banner.enabled ? "rgb(var(--brand) / 0.45)" : undefined,
        }}
      >
        <h2 className="text-sm font-bold uppercase tracking-wider">Announcement</h2>
        <Toggle
          checked={state.banner.enabled}
          onChange={(v) =>
            setState((s) => ({ ...s, banner: { ...s.banner, enabled: v } }))
          }
          label="Show a banner at the top of the front page"
        />
        <label className="block">
          <span className="label">What it says</span>
          <input
            className="input"
            value={state.banner.text}
            placeholder="Week 7 scores are in — brackets updated."
            onChange={(e) =>
              setState((s) => ({ ...s, banner: { ...s.banner, text: e.target.value } }))
            }
          />
        </label>
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          Off by default. The text is kept when you switch it off, so a banner
          you use every week does not need retyping.
        </p>
      </div>

      {/* ------------------------------------------------------- sections */}
      {state.sections.map((section, si) => (
        <div key={section.id} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input !w-auto !py-1.5 !text-[13px] font-bold sm:min-w-[240px]"
              value={section.label}
              placeholder="Group heading (leave empty for none)"
              onChange={(e) =>
                editSection(si, (s) => ({ ...s, label: e.target.value }))
              }
            />
            <select
              className="input !w-auto !py-1.5 !text-xs"
              value={section.style}
              onChange={(e) =>
                editSection(si, (s) => ({ ...s, style: e.target.value as HomeStyle }))
              }
            >
              {HOME_STYLES.map((st) => (
                <option key={st} value={st}>
                  {HOME_STYLE_LABELS[st]}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <Toggle
                checked={section.shown}
                onChange={(v) => editSection(si, (s) => ({ ...s, shown: v }))}
                label="Shown"
              />
              <button
                className="btn !px-2 !py-1 !text-[11px]"
                disabled={si === 0}
                title="Move this group up"
                onClick={() =>
                  setState((s) => ({ ...s, sections: move(s.sections, si, si - 1) }))
                }
              >
                ↑
              </button>
              <button
                className="btn !px-2 !py-1 !text-[11px]"
                disabled={si === state.sections.length - 1}
                title="Move this group down"
                onClick={() =>
                  setState((s) => ({ ...s, sections: move(s.sections, si, si + 1) }))
                }
              >
                ↓
              </button>
              <button
                className="btn !px-2 !py-1 !text-[11px]"
                style={{ color: "rgb(var(--bad))" }}
                title="Remove this whole group"
                onClick={() => {
                  if (confirm(`Remove "${section.label || "this group"}" and its ${section.items.length} link(s)?`)) {
                    setState((s) => ({
                      ...s,
                      sections: s.sections.filter((_, j) => j !== si),
                    }));
                  }
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {section.items.map((item, ii) => (
              <ItemRow
                key={item.id}
                item={item}
                style={section.style}
                first={ii === 0}
                last={ii === section.items.length - 1}
                onChange={(fn) =>
                  editSection(si, (s) => ({
                    ...s,
                    items: s.items.map((it, j) => (j === ii ? fn(it) : it)),
                  }))
                }
                onMove={(d) =>
                  editSection(si, (s) => ({ ...s, items: move(s.items, ii, ii + d) }))
                }
                onRemove={() =>
                  editSection(si, (s) => ({
                    ...s,
                    items: s.items.filter((_, j) => j !== ii),
                  }))
                }
              />
            ))}
          </div>

          <button
            className="btn !py-1.5 !text-xs"
            onClick={() =>
              editSection(si, (s) => ({
                ...s,
                items: [
                  ...s.items,
                  {
                    id: newId(),
                    title: "",
                    body: "",
                    href: "/ratings",
                    icon: "info" as IconName,
                    shown: true,
                  },
                ],
              }))
            }
          >
            + Add a link
          </button>
        </div>
      ))}

      <button
        className="btn !py-1.5 !text-xs"
        onClick={() =>
          setState((s) => ({
            ...s,
            sections: [
              ...s.sections,
              { id: newId("s"), label: "New group", style: "chip", shown: true, items: [] },
            ],
          }))
        }
      >
        + Add a group
      </button>

      <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
        The top five and the team count are read off the published board, so
        they are never typed here and cannot drift out of step with it. A link
        may point at a page on this site or at any http(s) address; an outside
        link is marked with an arrow and opens in a new tab.
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[rgb(var(--brand))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function ItemRow({
  item,
  style,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: HomeItem;
  style: HomeStyle;
  first: boolean;
  last: boolean;
  onChange: (fn: (i: HomeItem) => HomeItem) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const known = SITE_PAGES.some((p) => p.href === item.href);
  const [custom, setCustom] = useState(!known && item.href !== "");
  const bad = item.href.trim() !== "" && !isSafeHref(item.href);

  return (
    <div
      className="rounded-lg border p-2.5"
      style={{
        borderColor: bad ? "rgb(var(--bad))" : "rgb(var(--border))",
        opacity: item.shown ? 1 : 0.55,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input !w-auto !py-1 !text-[13px] font-semibold sm:min-w-[190px]"
          value={item.title}
          placeholder="Label"
          onChange={(e) => onChange((i) => ({ ...i, title: e.target.value }))}
        />

        {style !== "board" && (
          <select
            className="input !w-auto !py-1 !text-xs"
            value={item.icon}
            onChange={(e) =>
              onChange((i) => ({ ...i, icon: e.target.value as IconName }))
            }
          >
            {HOME_ICONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Toggle
            checked={item.shown}
            onChange={(v) => onChange((i) => ({ ...i, shown: v }))}
            label="Shown"
          />
          <button className="btn !px-2 !py-0.5 !text-[11px]" disabled={first}
            title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button className="btn !px-2 !py-0.5 !text-[11px]" disabled={last}
            title="Move down" onClick={() => onMove(1)}>↓</button>
          <button
            className="btn !px-2 !py-0.5 !text-[11px]"
            style={{ color: "rgb(var(--bad))" }}
            title="Remove this link"
            onClick={onRemove}
          >
            ✕
          </button>
        </div>
      </div>

      {style !== "chip" && (
        <input
          className="input mt-2 !py-1 !text-[12.5px]"
          value={item.body}
          placeholder={
            style === "card"
              ? "The sentence under the label"
              : "One short line under the label"
          }
          onChange={(e) => onChange((i) => ({ ...i, body: e.target.value }))}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
          Goes to
        </span>
        {custom ? (
          <>
            <input
              className="input !w-auto !py-1 !text-xs sm:min-w-[320px]"
              value={item.href}
              placeholder="https://alpreps.com/story/…"
              onChange={(e) => onChange((i) => ({ ...i, href: e.target.value }))}
            />
            <button
              className="btn !px-2 !py-0.5 !text-[11px]"
              onClick={() => {
                setCustom(false);
                onChange((i) => ({ ...i, href: SITE_PAGES[0].href }));
              }}
            >
              Pick a page instead
            </button>
          </>
        ) : (
          <>
            <select
              className="input !w-auto !py-1 !text-xs"
              value={item.href}
              onChange={(e) => onChange((i) => ({ ...i, href: e.target.value }))}
            >
              {SITE_PAGES.map((p) => (
                <option key={p.href} value={p.href}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              className="btn !px-2 !py-0.5 !text-[11px]"
              onClick={() => {
                setCustom(true);
                onChange((i) => ({ ...i, href: "" }));
              }}
            >
              Use a web address
            </button>
          </>
        )}
        {isExternal(item.href) && (
          <span className="text-[11px]" style={{ color: "rgb(var(--text-faint))" }}>
            opens in a new tab
          </span>
        )}
        {bad && (
          <span className="text-[11px] font-semibold" style={{ color: "rgb(var(--bad))" }}>
            Must start with / or http(s)://
          </span>
        )}
      </div>
    </div>
  );
}
