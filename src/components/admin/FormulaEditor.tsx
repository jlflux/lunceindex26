"use client";

import { useState } from "react";
import { Banner } from "./PublishButton";
import {
  DEFAULT_CONFIG,
  TWOWAY_DEFAULTS,
  type EngineConfig,
  type RatingModel,
  type TwoWayConfig,
} from "@/lib/types";

interface Knob {
  key: keyof EngineConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

interface TwoWayKnob {
  key: keyof TwoWayConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

const TWOWAY_GROUPS: { title: string; blurb: string; knobs: TwoWayKnob[] }[] = [
  {
    title: "Shrinkage",
    blurb:
      "How far a team is allowed to move off its prior. Both are in pseudo-games: at lambda 1.5, a team's carry-over weighs the same as one and a half games of results.",
    knobs: [
      { key: "lambda", label: "Level shrinkage", min: 0.1, max: 20, step: 0.1, help: "Applies to the overall rating, in pseudo-games — at 1.5, a team's carry-over weighs the same as one and a half games of results. Raising it kept a 0-2 team above the 3-0 team that shut it out." },
      { key: "split_lambda", label: "Offence/defence split shrinkage", min: 0, max: 60, step: 0.5, help: "Harder than the level: split-half reliability puts net at r=0.36 but the offence/defence split at only r=0.16. Too high and it manufactures the split out of the net rating — at 4, a team averaging four points a game showed an adjusted offence of 54. A full 2025 season predicts the same anywhere from 0 to 8." },
    ],
  },
  {
    title: "Priors",
    blurb: "What a team is worth before its own results speak.",
    knobs: [
      { key: "prior_scale", label: "Carry-over scale", min: 0, max: 5, step: 0.05, help: "Converts last season's rating into net points. A full 2025 season puts this at 2.07; 1.75 keeps early-season projections calibrated." },
      { key: "class_spread", label: "Classification spread", min: 0, max: 120, step: 1, help: "Net points from the weakest classification to the strongest, used when a team has no carry-over. Load-bearing: AHSAA schedules are almost all within-class, so without it an undefeated 1A team floats into the top five." },
      { key: "recency", label: "Recency", min: 0.5, max: 1, step: 0.01, help: "Weight multiplier per week of age. 1 treats week 0 and week 10 alike." },
    ],
  },
  {
    title: "Site and résumé",
    blurb:
      "Home edge, and the separate Strength of Record figure — your wins minus what a benchmark team would take from your schedule.",
    knobs: [
      { key: "hfa", label: "Home-field advantage", min: 0, max: 10, step: 0.1, help: "Measured at 1.7 points across 519 in-state games. Unlike the classic engine, this one uses it inside the solve, not only for projections." },
      { key: "sor_benchmark_rank", label: "Résumé benchmark rank", min: 1, max: 100, step: 1, help: "Whose schedule difficulty you are measured against. 10 means “what would a top-ten team have done with this slate”." },
      { key: "sor_scale", label: "Win-probability scale", min: 3, max: 60, step: 0.5, help: "Converts a rating gap into a win chance. Fitted out-of-sample at 15 and calibrated across the range." },
    ],
  },
];

const GROUPS: { title: string; blurb: string; knobs: Knob[] }[] = [
  {
    title: "Classification priors",
    blurb:
      "The baseline every team is pulled toward. This is what stops an undefeated 1A team floating above 6A playoff teams — the prior is re-applied on every solver pass, not just used as a starting point.",
    knobs: [
      { key: "prior_min", label: "Lowest class baseline", min: -10, max: 30, step: 0.5, help: "Rating floor for Class A." },
      { key: "prior_max", label: "Highest class baseline", min: 0, max: 40, step: 0.5, help: "Rating baseline for 6A." },
      { key: "prior_w", label: "Prior weight", min: 0, max: 1, step: 0.01, help: "How hard the baseline pulls. Higher is more classification-driven." },
      { key: "early_anchor", label: "Early-season anchor", min: 0, max: 1, step: 0.05, help: "Extra hold on last season's rating while the carry-over is still live. Fades to nothing by week four, so it never touches a finished season. At 0 a single Week 0 result carries 78% of a team's rating." },
    ],
  },
  {
    title: "Composite weights",
    blurb:
      "Applied after the Massey solve. Schedule strength is meant to dominate raw record; efficiency is deliberately small.",
    knobs: [
      { key: "sos_w", label: "Strength of schedule", min: 0, max: 3, step: 0.01, help: "Added on top of the Massey solve, which already values you by your opponents. 2025 ran at 0.90; 0.60 tracks MaxPreps, Massey and HSRatings more closely." },
      { key: "eff_w", label: "Efficiency", min: 0, max: 0.5, step: 0.005, help: "Offensive plus defensive efficiency, damped on weak schedules." },
      { key: "wr_w", label: "Win rate bonus", min: 0, max: 20, step: 0.1, help: "Rating points across the full 0–1 win-rate range. 2025 ran at 6.0; 3.0 fits the other systems better." },
    ],
  },
  {
    title: "Solver",
    blurb: "How the iterative solve treats margins and opponents.",
    knobs: [
      { key: "cap", label: "Margin cap", min: 7, max: 70, step: 1, help: "Ceiling on margin, so blowouts cannot be farmed. 2025 ran at 28, which recorded a 49-0 loss and a 28-0 loss identically; 35 predicts week-to-week margins better." },
      { key: "iters", label: "Iterations", min: 10, max: 1000, step: 10, help: "Passes over the schedule. 300 is well past convergence." },
      { key: "oos_mult", label: "Out-of-state multiplier", min: 0, max: 3, step: 0.05, help: "Starting point for the out-of-state pool, as a multiple of the field mean. Every non-AHSAA opponent shares one rating that is now solved from their actual results against Alabama teams, so this anchors it rather than setting it." },
      { key: "h2h_boost", label: "Head-to-head cap", min: 0, max: 20, step: 0.1, help: "Most a team can gain from having beaten a higher-rated team." },
      { key: "h2h_frac", label: "Head-to-head fraction", min: 0, max: 1, step: 0.01, help: "Share of the rating gap the correction closes." },
    ],
  },
  {
    title: "Playoff round multipliers",
    blurb: "Margins in the playoffs count for more, round by round.",
    knobs: [
      { key: "playoff_r1", label: "First round", min: 1, max: 3, step: 0.05, help: "" },
      { key: "playoff_r2", label: "Second round", min: 1, max: 3, step: 0.05, help: "" },
      { key: "playoff_r3", label: "Quarterfinals", min: 1, max: 3, step: 0.05, help: "" },
      { key: "playoff_r4", label: "Semifinals", min: 1, max: 3, step: 0.05, help: "" },
      { key: "playoff_r5", label: "Championship", min: 1, max: 3, step: 0.05, help: "" },
    ],
  },
  {
    title: "Projections",
    blurb: "Only affects the expected margin and result labels on team pages — not the ratings themselves.",
    knobs: [
      { key: "hfa", label: "Home-field advantage", min: 0, max: 10, step: 0.25, help: "Rating points added to the home side." },
      { key: "perf_expected_band", label: "As-expected band", min: 1, max: 30, step: 1, help: "Results within this many points of the projection count as expected." },
      { key: "perf_dominant_band", label: "Dominant threshold", min: 2, max: 60, step: 1, help: "Beating the projection by this much is dominant." },
    ],
  },
];

interface PreviewRow {
  rank: number;
  name: string;
  classification: string;
  rating: number;
  record: string;
  delta: number;
}

export default function FormulaEditor({ initial }: { initial: EngineConfig }) {
  const [cfg, setCfg] = useState<EngineConfig>(initial);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);
  const model: RatingModel = cfg.model === "twoway" ? "twoway" : "classic";
  const tw: TwoWayConfig = { ...TWOWAY_DEFAULTS, ...(cfg.twoway ?? {}) };

  function set(key: keyof EngineConfig, value: number) {
    setCfg((c) => ({ ...c, [key]: value }));
    setPreview(null);
  }

  function setModel(m: RatingModel) {
    // Carry a full two-way block along the moment the engine is selected, so
    // the sliders have something concrete to edit and the saved config is
    // explicit rather than relying on defaults filled in server-side.
    setCfg((c) => ({
      ...c,
      model: m,
      twoway: m === "twoway" ? { ...TWOWAY_DEFAULTS, ...(c.twoway ?? {}) } : c.twoway,
    }));
    setPreview(null);
  }

  function setTwoWay(key: keyof TwoWayConfig, value: number) {
    setCfg((c) => ({
      ...c,
      twoway: { ...TWOWAY_DEFAULTS, ...(c.twoway ?? {}), [key]: value },
    }));
    setPreview(null);
  }

  async function runPreview() {
    setBusy("preview");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed.");
      setPreview(body.top);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Preview failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      setMessage({
        tone: "good",
        text: "Formula saved. Publish from the dashboard to update the public site.",
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Save failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-bold leading-tight">Formula</h1>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() => {
            setCfg(DEFAULT_CONFIG);
            setPreview(null);
          }}
        >
          Reset to defaults
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider">Engine</h2>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              Two engines ship side by side so they can be compared on real
              data. Preview switches with this, so you can see the whole board
              move before anything is saved or published.
            </p>
            <div className="mt-3 space-y-2">
              {(
                [
                  [
                    "classic",
                    "Classic (Massey)",
                    "One rating per team, solved from margins, with schedule strength and win rate added afterwards. What the site runs today.",
                  ],
                  [
                    "twoway",
                    "Two-way (adjusted offence & defence)",
                    "Solves what you score and what you allow separately, each adjusted for the opponent. Over the full 2025 season it picks 82.7% of winners out of sample with a calibration slope of 1.01, and its 2025 board correlates 0.982 with the one that shipped.",
                  ],
                ] as [RatingModel, string, string][]
              ).map(([id, label, blurb]) => (
                <label
                  key={id}
                  className="flex cursor-pointer gap-2.5 rounded-lg p-2.5"
                  style={{
                    background:
                      model === id ? "rgb(var(--surface-2))" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="rating-model"
                    className="mt-0.5"
                    checked={model === id}
                    onChange={() => setModel(id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span
                      className="block text-[11px] leading-tight"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {model === "twoway" &&
            TWOWAY_GROUPS.map((g) => (
              <section key={g.title} className="card p-4">
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  {g.title}
                </h2>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  {g.blurb}
                </p>
                <div className="mt-4 space-y-4">
                  {g.knobs.map((k) => (
                    <Slider
                      key={k.key}
                      knob={{ ...k, key: k.key as unknown as keyof EngineConfig }}
                      value={tw[k.key]}
                      onChange={(v) => setTwoWay(k.key, v)}
                    />
                  ))}
                </div>
              </section>
            ))}

          {model === "classic" &&
            GROUPS.map((g) => (
              <section key={g.title} className="card p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                {g.title}
              </h2>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {g.blurb}
              </p>
                <div className="mt-4 space-y-4">
                  {g.knobs.map((k) => (
                    <Slider
                      key={k.key}
                      knob={k}
                      value={cfg[k.key] as number}
                      onChange={(v) => set(k.key, v)}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>

        {/* Preview panel */}
        <div className="space-y-3 lg:sticky lg:top-28 lg:self-start">
          <div className="flex gap-2">
            <button
              className="btn flex-1"
              onClick={runPreview}
              disabled={busy !== null}
            >
              {busy === "preview" ? "Solving…" : "Preview top 25"}
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={save}
              disabled={busy !== null || !dirty}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>

          {message && <Banner tone={message.tone}>{message.text}</Banner>}
          {dirty && !message && (
            <Banner tone="warn">Unsaved changes.</Banner>
          )}

          {preview && (
            <div className="card table-scroll">
              <table className="w-full">
                <thead>
                  <tr
                    className="border-b text-[10px] uppercase tracking-wider"
                    style={{
                      borderColor: "rgb(var(--border))",
                      color: "rgb(var(--text-faint))",
                    }}
                  >
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Team</th>
                    <th className="px-2 py-2 text-right">Rating</th>
                    <th className="px-2 py-2 text-right">Move</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr
                      key={r.name}
                      className="border-b last:border-0"
                      style={{ borderColor: "rgb(var(--border))" }}
                    >
                      <td
                        className="px-2 py-1.5 text-xs font-bold"
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        {r.rank}
                      </td>
                      <td className="px-2 py-1.5 text-xs font-semibold">
                        {r.name}
                        <span
                          className="ml-1 font-normal"
                          style={{ color: "rgb(var(--text-faint))" }}
                        >
                          {r.classification}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">
                        {r.rating.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {r.delta === 0 ? (
                          <span style={{ color: "rgb(var(--text-faint))" }}>
                            —
                          </span>
                        ) : (
                          <span
                            style={{
                              color:
                                r.delta > 0
                                  ? "rgb(var(--good))"
                                  : "rgb(var(--bad))",
                            }}
                          >
                            {r.delta > 0 ? "▲" : "▼"} {Math.abs(r.delta)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            Preview solves against current data without saving. &ldquo;Move&rdquo;
            compares each team&rsquo;s rank with the saved formula.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  knob,
  value,
  onChange,
}: {
  knob: Knob;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold">{knob.label}</label>
        <input
          type="number"
          className="input !w-24 !py-1 text-right !text-xs"
          value={value}
          min={knob.min}
          max={knob.max}
          step={knob.step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
      </div>
      <input
        type="range"
        className="mt-1.5 w-full accent-[rgb(var(--brand))]"
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={knob.label}
      />
      {knob.help && (
        <p
          className="mt-0.5 text-[11px] leading-tight"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {knob.help}
        </p>
      )}
    </div>
  );
}
