/**
 * Reading the AHSAA class list CSV (Team, Classification, Region).
 * Node-only — used by seeding and the parser test harness.
 */
import { readFileSync } from "node:fs";
import { parseCsvText } from "./csv";
import { slugify } from "./names";
import { CLS_ORDER, type Classification, type Team } from "./types";

export { parseCsvText as parseCsv };

export function loadRosterCsv(path: string): Team[] {
  const rows = parseCsvText(readFileSync(path, "utf8"));
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
