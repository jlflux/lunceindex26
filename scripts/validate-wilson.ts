/**
 * Checks our Wilson rating against David Wilson's own published output.
 *
 * The method is a fixed point of a circular definition, so "looks about
 * right" is not a check. His C and its 2023 college football season are
 * published at github.com/codykirkpatrick/wilson, along with the ratings that
 * code produced. This reads those input files, runs ours over them, and
 * compares the two — every team, to the point.
 *
 *   git clone https://github.com/codykirkpatrick/wilson /tmp/wilson
 *   npm run validate:wilson -- /tmp/wilson
 *
 * Nothing from that checkout is executed. The files are read, and the paths
 * come in as an argument rather than being run from.
 */
import { readFileSync } from "node:fs";
import { CENTER, SCALE, rankWilson, type WilsonTeam } from "../src/lib/wilson";
import type { Classification, Game } from "../src/lib/types";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: npm run validate:wilson -- <path to a wilson checkout>");
  process.exit(2);
}
const read = (f: string) => readFileSync(`${dir}/${f}`, "latin1");

/* --- names.txt: every variant before a '|' stands for the line's first field.
   His comparison ignores everything that is not a letter, so the key does. */
const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
const official = new Map<string, string>();
for (const line of read("names.txt").split("\n")) {
  const parts = line.split("|");
  if (parts.length < 2) continue;
  for (let i = 0; i < parts.length - 1; i++) official.set(letters(parts[i]), parts[0]);
}
const nameOf = (raw: string) => official.get(letters(raw)) ?? raw;

/* --- games.txt: "date Home 21 Away 7", where a name may itself hold digits */
const DATE = /^\d+-[A-Za-z]{3}-\d+$/;
let id = 1;
const games: Game[] = [];
for (const line of read("games.txt").split("\n")) {
  if (!line.trim() || line.startsWith("=====")) continue;
  let tokens = line.trim().split(/\s+/);
  if (DATE.test(tokens[0])) tokens = tokens.slice(1);
  const sides: { name: string[]; score: number }[] = [];
  let held: string[] = [];
  for (const tok of tokens) {
    const m = /^(\d+),?$/.exec(tok);
    if (m && held.length) {
      sides.push({ name: held, score: Number(m[1]) });
      held = [];
    } else held.push(tok);
  }
  if (sides.length !== 2) continue; // a header or a blank
  games.push({
    id: id++,
    t1: nameOf(sides[0].name.join(" ")), s1: sides[0].score,
    t2: nameOf(sides[1].name.join(" ")), s2: sides[1].score,
    week: 1, type: "regular", round: null, date: null, status: "final",
    neutral_site: false, forfeit_by: null,
  });
}

/* --- conf.txt: a division header carries the level its teams start at */
const start = new Map<string, number>();
const listed: string[] = [];
let divisionDefault = 0;
for (const raw of read("conf.txt").split("\n")) {
  const line = raw.replace(/\r$/, "");
  if (!line) continue;
  if (line[0] === "-" || line[0] === "=") {
    divisionDefault = (parseFloat(line.slice(6)) - CENTER) / SCALE;
  } else if (line[0] < "A") {
    const n = nameOf(line.trim());
    start.set(n, divisionDefault);
    listed.push(n);
  }
}
/**
 * His code marks "no default yet" with -1 — which is also exactly what a
 * division starting at 400 works out to, (400 - 500) / 100. So the sweep at
 * the end of read_divisions catches every Division III team and hands it the
 * last division's level instead. It changes nothing for a team the rest of
 * the field reaches, and it moves a closed conference bodily; reproduced here
 * because the published ratings were produced with it.
 */
for (const n of listed) if (start.get(n) === -1) start.set(n, divisionDefault);

const teams: WilsonTeam[] = listed.map((n) => ({
  name: n,
  slug: n.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classification: "6A" as Classification,
  region: 1,
}));

const rows = rankWilson(teams, games, {
  start: (n) => start.get(n) ?? divisionDefault,
  centerOn: "all",
});

/* --- byrating.txt, written as "%s %c %-17s%2d%3d%6d" */
const published: { name: string; rating: number; w: number; l: number }[] = [];
for (const line of read("byrating.txt").split("\n")) {
  if (line.length < 34) continue;
  const name = line.slice(6, 23).trim();
  const rating = Number(line.slice(28, 34).trim());
  if (!name || !Number.isFinite(rating)) continue;
  published.push({
    name, rating, w: Number(line.slice(23, 25)), l: Number(line.slice(25, 28)),
  });
}

const mine = new Map(rows.map((r) => [r.name, r]));
let matched = 0;
let records = 0;
const wrong: string[] = [];
for (const p of published) {
  const m = mine.get(p.name);
  if (!m) { wrong.push(`${p.name}: missing`); continue; }
  if (m.rating === p.rating) matched++;
  else if (wrong.length < 10) wrong.push(`${p.name}: his ${p.rating}, ours ${m.rating}`);
  if (m.wins === p.w && m.losses === p.l) records++;
}

console.log(`\n${games.length} games, ${rows.length} teams rated`);
console.log(`records agreeing: ${records} of ${published.length}`);
console.log(`ratings agreeing: ${matched} of ${published.length}`);
if (wrong.length) console.log("first disagreements:\n  " + wrong.join("\n  "));
console.log(
  matched === published.length && records === published.length
    ? "\nOurs is his, to the point.\n"
    : "\nThe port does not reproduce the published ratings.\n",
);
process.exit(matched === published.length && records === published.length ? 0 : 1);
