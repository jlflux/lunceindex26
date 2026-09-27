/**
 * The bracket resolver.
 *
 * The thing worth testing is the join. The stored bracket names no team — it
 * names places — so everything depends on "who holds R4-2" being answered the
 * same way the standings answer it, and on a winner travelling up the tree
 * with the seed it came in on.
 *
 * Section 5 is the one that matters most: a real result beats a projection,
 * always and in both directions. Get that wrong and the board quietly shows a
 * projected team advancing out of a game somebody actually lost.
 *
 * Usage: npx tsx scripts/test-bracket.ts
 */
import {
  applyPinnedOrder,
  assignPlaces,
  buildTree,
  defaultSlots,
  placesFor,
  regionKey,
  resolveBracket,
  seedLabel,
  seededRegions,
  defaultStatus,
  type SeededTeam,
} from "../src/lib/bracket";
import { emptyBracketState, type BracketState } from "../src/lib/bracket-types";
import { computeOdds } from "../src/lib/playoffs";
import {
  PROSE_COLOURS,
  renderRichText,
  sanitizeHtml,
} from "../src/lib/sanitize";
import type { Classification, Game, RatingRow } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let nextId = 1;
const g = (
  t1: string,
  t2: string,
  s1: number | null,
  s2: number | null,
  opts: Partial<Game> = {},
): Game => ({
  id: nextId++,
  t1,
  s1,
  t2,
  s2,
  week: 1,
  type: "regular",
  round: null,
  date: null,
  status: s1 === null ? "scheduled" : "final",
  neutral_site: false,
  forfeit_by: null,
  ...opts,
});

const row = (
  name: string,
  region: number,
  rating: number,
  opts: Partial<RatingRow> = {},
): RatingRow =>
  ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    classification: "5A",
    region,
    wins: 0,
    losses: 0,
    rating,
    massey: 0,
    sos: 0,
    o_eff: 0,
    d_eff: 0,
    ppg: 0,
    papg: 0,
    prior_blend: 0,
    rank: 0,
    class_rank: 0,
    ...opts,
  }) as RatingRow;

/** Two 5A regions of four, rated so the computed order is predictable. */
function world() {
  const ratings: RatingRow[] = [];
  for (let r = 1; r <= 2; r++) {
    for (let p = 1; p <= 4; p++) {
      ratings.push(row(`R${r}T${p}`, r, 100 - (r - 1) * 10 - p));
    }
  }
  return ratings;
}

/** A region game between two teams, won by the first. */
const beat = (w: string, l: string) => g(w, l, 21, 7);

/** Round-robin results that put T1 > T2 > T3 > T4 in each region. */
function roundRobin(): Game[] {
  const out: Game[] = [];
  for (let r = 1; r <= 2; r++) {
    for (let a = 1; a <= 4; a++) {
      for (let b = a + 1; b <= 4; b++) out.push(beat(`R${r}T${a}`, `R${r}T${b}`));
    }
  }
  return out;
}

function stateWith(slots: BracketState["classes"]["5A"]): BracketState {
  const s = emptyBracketState();
  s.classes["5A"] = slots;
  return s;
}

const base_ = () => ({
  alignment: [1, 2],
  slots: defaultSlots("5A" as Classification, 2),
  results: {},
  projected: {},
  regions: {},
});

console.log("\n1. The tree");
{
  const rounds = buildTree(defaultSlots("5A", 2));
  check("eight slots make three rounds", rounds.length === 3, String(rounds.length));
  check("four games, then two, then one",
    rounds.map((r) => r.length).join() === "4,2,1",
    rounds.map((r) => r.length).join());
  check("ids are positional", rounds[1][0].id === "r2g0" && rounds[2][0].id === "r3g0");
  check(
    "a second-round game takes its sides from two first-round games",
    rounds[1][0].top.kind === "game" && rounds[1][0].top.ref === "r1g0",
  );
  check("an empty bracket makes no rounds", buildTree([]).length === 0);
  check("a seed label reads as the old site wrote it",
    seedLabel({ region: 4, place: 2 }) === "R4-2");
}

console.log("\n2. Seeding follows the standings, and a pin overrides it");
{
  const ratings = world();
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());
  const r1 = seeded.get(regionKey("5A", 1))!;
  check("the region is ordered by its record",
    r1.map((t) => t.name).join() === "R1T1,R1T2,R1T3,R1T4",
    r1.map((t) => t.name).join());
  check("places are 1-based and dense", r1.map((t) => t.place).join() === "1,2,3,4");
  check("the top four qualify when four go", r1.every((t) => t.qualifies));
  check("region records came through", r1[0].region_w === 3 && r1[0].region_l === 0);

  const pinned = emptyBracketState();
  pinned.classes["5A"] = { ...base_(), regions: { "1": { note: "", order: ["R1T4", "R1T1"] } } };
  const p = seededRegions(ratings, games, undefined, pinned).get(regionKey("5A", 1))!;
  check("a pin puts the named teams first, in order",
    p.map((t) => t.name).join() === "R1T4,R1T1,R1T2,R1T3",
    p.map((t) => t.name).join());
  check("and renumbers the places", p[0].place === 1 && p[0].name === "R1T4");
}

console.log("\n3. A pin cannot empty a bracket");
{
  const computed = [{ name: "A" }, { name: "B" }, { name: "C" }];
  check("an unknown name is skipped, not honoured",
    applyPinnedOrder(computed, ["Nobody", "C"]).map((t) => t.name).join() === "C,A,B");
  check("a duplicate is used once",
    applyPinnedOrder(computed, ["B", "B"]).map((t) => t.name).join() === "B,A,C");
  check("a team the pin forgets keeps its place behind the named ones",
    applyPinnedOrder(computed, ["C"]).map((t) => t.name).join() === "C,A,B");
  check("an empty pin changes nothing",
    applyPinnedOrder(computed, []).map((t) => t.name).join() === "A,B,C");
}

console.log("\n4. Byes advance without being played");
{
  const ratings = world();
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());
  // Four slots, one of them a bye: R1T1 walks into round two.
  const st = stateWith({
    ...base_(),
    slots: [{ region: 1, place: 1 }, null, { region: 1, place: 2 }, { region: 2, place: 1 }],
  });
  const b = resolveBracket(st, "5A", seeded, games)!;
  check("the bye slot is marked", b.rounds[0][0].bottom.bye);
  check("its opponent is named", b.rounds[0][0].top.team === "R1T1");
  check(
    "and reaches the next round with nothing played",
    b.rounds[1][0].top.team === "R1T1",
    String(b.rounds[1][0].top.team),
  );
  check(
    "a bye against a bye advances nobody",
    resolveBracket(stateWith({ ...base_(), slots: [null, null, null, null] }), "5A", seeded, games)!
      .rounds[1][0].top.team === null,
  );
}

console.log("\n5. A real result beats a projection, in both directions");
{
  const ratings = world();
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());

  const slots = [
    { region: 1, place: 1 },
    { region: 2, place: 4 },
    { region: 1, place: 2 },
    { region: 2, place: 3 },
  ];
  // Projected: the better seed wins r1g0. Actual: it lost.
  const st = stateWith({
    ...base_(),
    slots,
    projected: { r1g0: "top", r1g1: "top" },
  });
  st.showProjections = true;

  const upset = [...games, g("R1T1", "R2T4", 7, 35, { type: "playoff", round: "r1" })];

  const actual = resolveBracket(st, "5A", seeded, upset)!;
  check("without projections the played game decides",
    actual.rounds[1][0].top.team === "R2T4",
    String(actual.rounds[1][0].top.team));
  check("the loser is marked", actual.rounds[0][0].top.loser && actual.rounds[0][0].bottom.winner);
  check("the score comes off the games table",
    actual.rounds[0][0].top.score === 7 && actual.rounds[0][0].bottom.score === 35);
  check("the game is locked", actual.rounds[0][0].locked);

  const proj = resolveBracket(st, "5A", seeded, upset, { projected: true })!;
  check(
    "and a projection cannot overturn it",
    proj.rounds[1][0].top.team === "R2T4",
    String(proj.rounds[1][0].top.team),
  );
  check(
    "while an unplayed game does follow the projection",
    proj.rounds[0][1].top.team === "R1T2" && proj.rounds[1][0].bottom.team === "R1T2",
  );
  check("and says so", proj.rounds[1][0].bottom.projected);
  check(
    "the real result is not labelled a projection",
    !proj.rounds[1][0].top.projected,
  );

  // The gate: projections stay private until published.
  const shut = stateWith({ ...base_(), slots, projected: { r1g1: "top" } });
  shut.showProjections = false;
  const hidden = resolveBracket(shut, "5A", seeded, games, { projected: true })!;
  check(
    "an unpublished projection is not shown even when asked for",
    hidden.rounds[1][0].bottom.team === null,
  );
}

console.log("\n6. A forfeit in the bracket follows the ruling");
{
  const ratings = world();
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());
  const st = stateWith({
    ...base_(),
    slots: [{ region: 1, place: 1 }, { region: 2, place: 4 }, { region: 1, place: 2 }, { region: 2, place: 3 }],
  });
  const vacated = [
    ...games,
    g("R1T1", "R2T4", 48, 7, { type: "playoff", round: "r1", forfeit_by: "t1" }),
  ];
  const b = resolveBracket(st, "5A", seeded, vacated)!;
  check("the side that forfeited does not advance", b.rounds[1][0].top.team === "R2T4");
  check("but the scoreline is still shown",
    b.rounds[0][0].top.score === 48 && b.rounds[0][0].bottom.score === 7);
}

console.log("\n7. A barred team never reaches a slot");
{
  const ratings = world().map((t) =>
    t.name === "R1T1" ? { ...t, postseason_ineligible: true } : t,
  );
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());
  const r1 = seeded.get(regionKey("5A", 1))!;
  const barred = r1.find((t) => t.name === "R1T1")!;
  check("it is flagged", barred.ineligible);
  check("it holds no place", barred.place === 0);
  check("it qualifies for nothing", !barred.qualifies);
  check("and is sorted last", r1[r1.length - 1].name === "R1T1", r1.map((t) => t.name).join());
  check(
    "so the first seed is the best team that can actually go",
    r1[0].name === "R1T2",
    r1[0].name,
  );
  check("a region of four sending four now sends three", placesFor("5A", 3) === 3);
}

console.log("\n8. A seed nobody holds is reported rather than drawn");
{
  const ratings = world();
  const games = roundRobin();
  const seeded = seededRegions(ratings, games, undefined, emptyBracketState());
  const st = stateWith({
    ...base_(),
    slots: [{ region: 1, place: 1 }, { region: 1, place: 9 }, { region: 2, place: 1 }, { region: 2, place: 2 }],
  });
  const b = resolveBracket(st, "5A", seeded, games)!;
  check("the missing seed is named", b.unresolved.join() === "R1-9", b.unresolved.join());
  check("its slot keeps the label and no team",
    b.rounds[0][0].bottom.seed === "R1-9" && b.rounds[0][0].bottom.team === null);
  check("and it is not a bye — a bye is a decision, this is a gap",
    !b.rounds[0][0].bottom.bye);
}

console.log("\n9. The status pill is an opinion, not a reading of the odds");
{
  // It used to map the chance of *qualifying* onto High/Medium/Low, which is
  // the wrong quantity in both directions — in a class where everyone goes
  // through, a side certain to finish last is "High" for the same reason as
  // the side certain to finish first. And it set "Clinched" from clinching a
  // *berth*, so every team in such a class read Clinched from the opening
  // whistle. Both of those are what these check against.
  const d = (o: Partial<Parameters<typeof defaultStatus>[0]>) =>
    defaultStatus({ eliminated: false, ineligible: false, ...o });

  check("the default is medium", d({}) === "medium");
  check("barred outranks everything", d({ ineligible: true, eliminated: true }) === "ineligible");
  check("mathematically out is a fact, so it is set", d({ eliminated: true }) === "out");

  const ratings = world();
  const games = roundRobin();
  const odds = computeOdds(ratings, games, { trials: 200, seed: 3, qualifiers: 4 });
  const seeded = seededRegions(ratings, games, odds, emptyBracketState());
  const r1 = seeded.get(regionKey("5A", 1))!;

  check(
    "a region where everyone qualifies is all medium, not all clinched",
    r1.every((t) => t.status === "medium"),
    JSON.stringify(r1.map((t) => `${t.name}:${t.status}`)),
  );
  check(
    "even for a team the simulation is certain about",
    r1.filter((t) => t.playoff === 1).every((t) => t.status === "medium"),
  );
  check("no team is given high or low by the code", !r1.some((t) => t.status === "high" || t.status === "low"));

  // An override beats the lot, including the automatic Out.
  const over = emptyBracketState();
  over.classes["5A"] = {
    ...base_(),
    regions: { "1": { note: "", status: { R1T1: "clinched", R1T4: "high" } } },
  };
  const o1 = seededRegions(ratings, games, odds, over).get(regionKey("5A", 1))!;
  check("an override wins", o1.find((t) => t.name === "R1T1")?.status === "clinched");
  check("including one the code would not have chosen", o1.find((t) => t.name === "R1T4")?.status === "high");
}

console.log("\n9b. A locked place is proved, and proved conservatively");
{
  const ratings = world();
  const played = roundRobin();
  const odds = computeOdds(ratings, played, { trials: 200, seed: 4, qualifiers: 4 });
  const seeded = seededRegions(ratings, played, odds, emptyBracketState());
  const r1 = seeded.get(regionKey("5A", 1))!;

  check(
    "a region with no games left has every place settled",
    r1.every((t) => t.place_locked),
    JSON.stringify(r1.map((t) => `${t.name}:${t.place_locked}`)),
  );
  check(
    "and the range collapses onto the place actually held",
    r1.every((t) => t.best_place === t.place && t.worst_place === t.place),
    JSON.stringify(r1.map((t) => `${t.name}:${t.best_place}-${t.worst_place}@${t.place}`)),
  );

  // Now the realistic wide-open case: the schedule is loaded, nothing played.
  const scheduled = played.map((x) => ({ ...x, s1: null, s2: null }));
  const none = computeOdds(ratings, scheduled, { trials: 200, seed: 5, qualifiers: 4 });
  const open = seededRegions(ratings, scheduled, none, emptyBracketState()).get(
    regionKey("5A", 1),
  )!;
  check(
    "with everything still to play, nobody is settled",
    open.every((t) => !t.place_locked),
    JSON.stringify(open.map((t) => `${t.name}:${t.place_locked}`)),
  );
  check(
    "and every place is still reachable",
    open.every((t) => t.best_place === 1 && t.worst_place === open.length),
    JSON.stringify(open.map((t) => `${t.best_place}-${t.worst_place}`)),
  );
  check(
    "the place a team holds is always inside its own range",
    [...r1, ...open].every((t) => t.best_place <= t.place && t.place <= t.worst_place),
  );

  // The range is a bound on win totals; the place comes from the tiebreak,
  // which counts a tie as half a win. Those order teams differently, and a
  // team sitting 2nd was being told it could finish "3rd to 3rd".
  const drawn = [
    g("R1T1", "R1T2", 14, 14),
    g("R1T1", "R1T3", 21, 7),
    g("R1T2", "R1T3", 21, 7),
    g("R1T2", "R1T4", 14, 14),
    g("R1T3", "R1T4", 21, 7),
    g("R1T1", "R1T4", 21, 7),
  ];
  const tied = seededRegions(
    ratings,
    drawn,
    computeOdds(ratings, drawn, { trials: 200, seed: 8, qualifiers: 4 }),
    emptyBracketState(),
  ).get(regionKey("5A", 1))!;
  check(
    "with ties in the table the range still contains the place",
    tied.every((t) => t.best_place <= t.place && t.place <= t.worst_place),
    JSON.stringify(tied.map((t) => `${t.name}@${t.place}:${t.best_place}-${t.worst_place}`)),
  );
  check(
    "and a settled place is reported as its own range, not a span",
    tied.filter((t) => t.place_locked).every((t) =>
      t.best_place === t.place && t.worst_place === t.place),
    JSON.stringify(tied.map((t) => `${t.name}:${t.place_locked}:${t.best_place}-${t.worst_place}`)),
  );

  // A region with no region games at all is unknown, not decided — the two
  // are indistinguishable from "nothing left to play" alone.
  const empty = computeOdds(ratings, [], { trials: 50, seed: 6, qualifiers: 4 });
  const blank = seededRegions(ratings, [], empty, emptyBracketState()).get(
    regionKey("5A", 1),
  )!;
  check(
    "a region that has not played is not reported as settled",
    blank.every((t) => !t.place_locked),
    JSON.stringify(blank.map((t) => `${t.name}:${t.place_locked}`)),
  );
  check(
    "and the seed share is the chance of the place it holds",
    r1.every((t) => t.seed_odds === null || (t.seed_odds >= 0 && t.seed_odds <= 1)),
  );
}

console.log("\n10. The default shapes");
{
  const aa = defaultSlots("AA", 2);
  check("AA is sixteen slots from two regions", aa.length === 16);
  check("its two champions are as far apart as the bracket allows",
    seedLabel(aa[0]!) === "R1-1" && seedLabel(aa[14]!) === "R2-1",
    `${seedLabel(aa[0]!)} / ${seedLabel(aa[14]!)}`);
  const sixA = defaultSlots("6A", 4);
  check("6A is thirty-two slots", sixA.length === 32);
  check("with eight byes for twenty-four teams",
    sixA.filter((s) => s === null).length === 8);
  check("the byes sit beside the top two seeds of each region",
    sixA[0] !== null && sixA[1] === null && sixA[4] !== null && sixA[5] === null);
  const five = defaultSlots("5A", 8);
  check("an eight-region class pairs into thirty-two", five.length === 32);
}

console.log("\n11. Reordering in the editor matches what gets published");
{
  // The bug this exists for: the editor rendered a server-computed array and
  // never looked at its own edits, so a drag marked the region pinned and left
  // the list exactly where it was. No unit test would have caught the frozen
  // prop — but the contract underneath it is a pure function, and this is it:
  // reordering the way the editor reorders has to produce what the server
  // produces when that order is saved. Name for name, and place for place.
  const ratings = world();
  const games = roundRobin();
  const base = seededRegions(ratings, games, undefined, emptyBracketState());
  const region = base.get(regionKey("5A", 1))!;

  // Drag the last team to the front, the way `move()` does.
  const names = region.map((t) => t.name);
  names.unshift(names.pop() as string);

  // What the editor now shows.
  const inEditor = assignPlaces("5A", applyPinnedOrder(region, names));

  // What the server produces once that pin is saved.
  const pinnedState = emptyBracketState();
  pinnedState.classes["5A"] = {
    ...base_(),
    regions: { "1": { note: "", order: names } },
  };
  const published = seededRegions(ratings, games, undefined, pinnedState).get(
    regionKey("5A", 1),
  )!;

  check(
    "the same teams, in the same order",
    inEditor.map((t) => t.name).join() === published.map((t) => t.name).join(),
    `${inEditor.map((t) => t.name).join()} vs ${published.map((t) => t.name).join()}`,
  );
  check(
    "numbered the same",
    inEditor.map((t) => t.place).join() === published.map((t) => t.place).join(),
    `${inEditor.map((t) => t.place).join()} vs ${published.map((t) => t.place).join()}`,
  );
  check(
    "and agreeing on who is in a place",
    inEditor.map((t) => t.qualifies).join() ===
      published.map((t) => t.qualifies).join(),
  );
  check(
    "the drag actually moved somebody",
    inEditor[0].name !== region[0].name,
    `${region[0].name} → ${inEditor[0].name}`,
  );
  check("and the new first team is first", inEditor[0].place === 1);

  // Moving a team and moving it back is the order the season computes.
  const there = applyPinnedOrder(region, names);
  const backNames = there.map((t) => t.name);
  backNames.push(backNames.shift() as string);
  check(
    "moving a team back restores the computed order",
    applyPinnedOrder(region, backNames)
      .map((t) => t.name)
      .join() === region.map((t) => t.name).join(),
  );

  // Places skip a barred team wherever it is dragged to.
  const withBarred = world().map((t) =>
    t.name === "R1T2" ? { ...t, postseason_ineligible: true } : t,
  );
  const b = seededRegions(withBarred, games, undefined, emptyBracketState()).get(
    regionKey("5A", 1),
  )!;
  const dragged = b.map((t) => t.name);
  dragged.unshift(dragged.splice(dragged.indexOf("R1T2"), 1)[0]);
  const renumbered = assignPlaces("5A", applyPinnedOrder(b, dragged));
  check(
    "a barred team dragged to the top still holds no place",
    renumbered[0].name === "R1T2" &&
      renumbered[0].place === 0 &&
      !renumbered[0].qualifies,
    JSON.stringify(renumbered.map((t) => `${t.name}:${t.place}`)),
  );
  check(
    "and the teams under it are numbered from one, densely",
    renumbered
      .filter((t) => !t.ineligible)
      .map((t) => t.place)
      .join() === "1,2,3",
    renumbered.map((t) => t.place).join(),
  );
}

console.log("\n12. The explainer is stored HTML, so it is sanitised");
{
  const keeps = (a: string, b: string) => sanitizeHtml(a) === b;
  check("ordinary markup survives",
    keeps("<h2>Hi</h2><p>There <strong>now</strong></p>",
          "<h2>Hi</h2><p>There <strong>now</strong></p>"));
  check("a script goes, contents and all",
    keeps("<p>a</p><script>alert(1)</script><p>b</p>", "<p>a</p><p>b</p>"));
  check("an unknown tag is unwrapped, keeping its words",
    keeps("<p>Keep <marquee>this</marquee></p>", "<p>Keep this</p>"));
  check("an event handler is dropped",
    sanitizeHtml('<p onclick="steal()">x</p>') === "<p>x</p>");
  check("a javascript: link loses its href",
    sanitizeHtml('<a href="javascript:alert(1)">x</a>') === "<a>x</a>");
  check("an ordinary link keeps it",
    sanitizeHtml('<a href="https://ahsaa.com">x</a>').startsWith('<a href="https://ahsaa.com"'));
  check("and is not left able to reach back through the opener",
    sanitizeHtml('<a href="https://ahsaa.com">x</a>').includes('rel="noopener noreferrer"'));
  check("a relative link is fine", sanitizeHtml('<a href="/teams">x</a>') === '<a href="/teams">x</a>');
  check("unbalanced markup is closed rather than leaking",
    sanitizeHtml("<p><strong>x") === "<p><strong>x</strong></p>");
  check("a stray close tag closes nothing", sanitizeHtml("</p>text") === "text");
  check("a comment cannot smuggle a tag", !sanitizeHtml("<!-- <script>x</script> -->").includes("script"));
  check("bare text is escaped", sanitizeHtml("a < b & c") === "a &lt; b &amp; c");
  check("empty in, empty out", sanitizeHtml("") === "");
}

console.log("\n13. Colour is allowed in, and nothing else is");
{
  const S = sanitizeHtml;

  // The two ways to colour something.
  check("a named theme colour survives",
    S('<span class="c-brand">x</span>') === '<span class="c-brand">x</span>');
  check("so does a hex",
    S('<span style="color:#e01b1b">x</span>') === '<span style="color: #e01b1b">x</span>',
    S('<span style="color:#e01b1b">x</span>'));
  check("and a keyword", S('<p style="color: red">x</p>') === '<p style="color: red">x</p>');
  check("and rgb()",
    S('<b style="color: rgb(224, 27, 27)">x</b>') === '<b style="color: rgb(224, 27, 27)">x</b>');
  check("both at once on one tag",
    S('<span class="c-good" style="color:#fff">x</span>')
      === '<span class="c-good" style="color: #fff">x</span>',
    S('<span class="c-good" style="color:#fff">x</span>'));

  // An allowlist, so anything invented is gone.
  check("an unknown class is dropped, keeping the text",
    S('<span class="evil">x</span>') === "<span>x</span>");
  check("a known class among unknown ones is kept alone",
    S('<span class="evil c-warn other">x</span>') === '<span class="c-warn">x</span>');

  // Everything a style attribute must not be able to carry.
  check("expression() cannot get through",
    S('<span style="color:expression(alert(1))">x</span>') === "<span>x</span>",
    S('<span style="color:expression(alert(1))">x</span>'));
  check("nor a url()",
    S('<span style="color:url(javascript:alert(1))">x</span>') === "<span>x</span>");
  check("a property that is not colour is discarded",
    S('<span style="background:url(javascript:alert(1))">x</span>') === "<span>x</span>");
  check("a backslash escape cannot get through",
    S('<span style="color:\\65 xpression(1)">x</span>') === "<span>x</span>");
  check("nor a comment",
    S('<span style="color:/**/red">x</span>') === "<span>x</span>");
  // Keeps the colour, drops the injection — the same leniency as the
  // word-processor case below, and what matters is that nothing of the
  // second declaration reaches the page.
  check(
    "a value cannot close its own rule to restyle the page",
    S('<span style="color:red;} body{display:none}">x</span>') ===
      '<span style="color: red">x</span>',
    S('<span style="color:red;} body{display:none}">x</span>'),
  );
  check(
    "and an injection with no valid colour beside it leaves nothing",
    S('<span style="} body{display:none}">x</span>') === "<span>x</span>",
    S('<span style="} body{display:none}">x</span>'),
  );

  // Lenient about its neighbours, strict about itself.
  check("a word-processor paste keeps the colour and loses the rest",
    S('<span style="color:#FF0000;font-family:Arial">x</span>')
      === '<span style="color: #FF0000">x</span>',
    S('<span style="color:#FF0000;font-family:Arial">x</span>'));

  // Shape of the output itself.
  check("a quote in a value cannot break out of the attribute",
    !S('<span style=\'color: "onload=alert(1)\'>x</span>').includes("onload"),
    S('<span style=\'color: "onload=alert(1)\'>x</span>'));
  check("colour is not accepted on a structural tag",
    S('<ul style="color:red" class="c-brand"><li>x</li></ul>') === "<ul><li>x</li></ul>",
    S('<ul style="color:red" class="c-brand"><li>x</li></ul>'));
  check("but is on a list item",
    S('<li class="c-muted">x</li>') === '<li class="c-muted">x</li>');
  check("a link keeps its href alongside a colour",
    S('<a href="/teams" class="c-brand">x</a>').includes('href="/teams"') &&
      S('<a href="/teams" class="c-brand">x</a>').includes('class="c-brand"'));
  check("every name the admin advertises is actually accepted",
    PROSE_COLOURS.every(
      (c) => S(`<span class="${c}">x</span>`) === `<span class="${c}">x</span>`,
    ));

  // The live explainer is authored with newlines and no block tags at all.
  check("a newline becomes a break, because that is how it was typed",
    renderRichText("a\nb") === "a<br>b");
  check("a blank line becomes two", renderRichText("a\n\nb") === "a<br><br>b");
  check("and the markup around it still survives",
    renderRichText("<b>a</b>\n- x") === "<b>a</b><br>- x");
  check("a script still cannot get through that path",
    !renderRichText("<script>x</script>\ny").includes("script"));
}

console.log(
  failures === 0 ? "\nThe bracket behaves.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
