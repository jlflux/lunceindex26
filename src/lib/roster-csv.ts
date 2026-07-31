/**
 * Reading the AHSAA class list CSV (Team, Classification, Region).
 * Node-only — used by seeding and the parser test harness.
 */
import { readFileSync } from "node:fs";
import { slugify } from "./names";
import { CLS_ORDER, type Classification, type Team } from "./types";

/** Minimal RFC4180 row splitter — handles quoted fields containing commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function loadRosterCsv(path: string): Team[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const [header, ...body] = rows;
  const idx = (label: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === label);

  const iName = idx("team");
  const iCls = idx("classification");
  const iReg = idx("region");
  if (iName < 0 || iCls < 0 || iReg < 0) {
    throw new Error(
      `CSV must have Team, Classification, Region columns. Got: ${header.join(", ")}`,
    );
  }

  return body.map((r) => {
    const name = r[iName].trim();
    const cls = r[iCls].trim() as Classification;
    if (!(cls in CLS_ORDER)) {
      throw new Error(`Unknown classification "${cls}" for ${name}`);
    }
    return {
      name,
      slug: slugify(name),
      classification: cls,
      region: Number(r[iReg].trim()),
      preseason_prior: null,
      prior_source: null,
    };
  });
}
