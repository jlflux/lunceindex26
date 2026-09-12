/**
 * Checks the school-name matcher against the real 2026 roster.
 *
 * Every AHSAA sheet spells schools its own way, so this is the layer that
 * decides whether an uploaded PDF imports cleanly or throws a hundred names
 * back at you. The cases below are ones the generic rules get wrong on their
 * own, plus the guardrails that stop a misspelling being quietly adopted as a
 * new school.
 */
import { ALIASES, buildIndex, matchTeam, nonMemberSet } from "../src/lib/names";
import { loadRosterCsv } from "../src/lib/roster-csv";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
const index = buildIndex(teams);
const resolve = (raw: string) => matchTeam({ raw }, index).name;

console.log("\n1. Long-form sheet spellings resolve to the roster");
{
  // Initials, which the roster writes closed up and the sheets write out.
  const cases: [string, string][] = [
    ["B.B. Comer High School", "BB Comer"],
    ["G.W. Long High School", "GW Long"],
    ["T.R. Miller High School", "TR Miller"],
    ["A.H. Parker High School", "Parker"],
    ["Mary G. Montgomery High School", "Mary Montgomery"],
    ["Kate Duncan Smith DAR HS", "DAR"],
    // Formal names the roster shortens.
    ["Lee-Scott Academy", "Lee-Scott"],
    ["Northside Methodist Academy", "Northside Methodist"],
    ["University Charter School", "University Charter"],
    ["Fort Dale Academy", "Fort Dale"],
    ["Decatur Heritage Christian Academy", "Decatur Heritage"],
    ["Lindsay Lane Christian", "Lindsay Lane"],
    ["West End Walnut Grove", "West End"],
    ["Catholic Montgomery", "Montgomery Catholic"],
    // Plain suffix stripping.
    ["Briarwood Christian School", "Briarwood"],
    ["Talladega High School", "Talladega"],
  ];
  for (const [raw, want] of cases) {
    const got = resolve(raw);
    check(`"${raw}" → ${want}`, got === want, `got ${got}`);
  }
}

console.log("\n2. 'HS' is stripped wherever the sheet puts it");
{
  check('"Brindlee Mountain HS"', resolve("Brindlee Mountain HS") === "Brindlee Mountain");
  check('"Gordo HSF"', resolve("Gordo HSF") === "Gordo");
  check('"Carver HS - Montgomery"', resolve("Carver HS - Montgomery") === "Carver-Montgomery");
  check('"Central HS, Phenix City"', resolve("Central HS, Phenix City") === "Central-Phenix City");
}

console.log("\n3. Ambiguous bases are not guessed at");
{
  // Six schools are called some form of "Central". Without a class and region
  // to separate them the matcher must decline rather than pick one.
  check("bare \"Central\" does not resolve", resolve("Central") === null);
  check(
    "with class and region it does",
    matchTeam({ raw: "Central", classToken: "6A", regionToken: "R-2" }, index)
      .name === "Central-Phenix City",
    `got ${matchTeam({ raw: "Central", classToken: "6A", regionToken: "R-2" }, index).name}`,
  );
}

console.log("\n4. A misspelling is reported, not adopted");
{
  // The failure that matters is silent: a typo quietly becoming a new
  // out-of-state school, whose games then count for nobody.
  const m = matchTeam({ raw: "Hackelburg" }, index);
  check("\"Hackelburg\" is not treated as out-of-state", m.outOfState === false);
  check("and it is not silently matched", m.name === null || m.confidence < 1);
}

console.log("\n5. Listed non-members import as out-of-state");
{
  const listed = nonMemberSet(["Tharptown", "Snook Christian"]);

  // Without the list an independent is indistinguishable from a typo, so it
  // is reported and its games are dropped.
  check(
    "unlisted, Tharptown does not match",
    matchTeam({ raw: "Tharptown" }, index).name === null,
  );

  const m = matchTeam({ raw: "Tharptown", nonMembers: listed }, index);
  check("listed, it resolves", m.name === "Tharptown", `got ${m.name}`);
  check("and is flagged out-of-state", m.outOfState === true);

  // Suffix variants of a listed name count too.
  check(
    '"Tharptown High School" resolves as well',
    matchTeam({ raw: "Tharptown High School", nonMembers: listed }, index)
      .outOfState === true,
  );

  // A genuine misspelling must still be reported rather than silently
  // becoming a new out-of-state school.
  check(
    '"Hackelburg" is still not out-of-state',
    matchTeam({ raw: "Hackelburg", nonMembers: listed }, index).outOfState ===
      false,
  );

  // The shipped fallback still applies when the table is unreachable.
  check(
    "Vina holds without any list",
    matchTeam({ raw: "Vina" }, index).outOfState === true,
  );
}

console.log("\n6. Out-of-state opponents are recognized by their state");
{
  for (const raw of ["Pace FL", "Creekside GA", "Jackson Prep MS"]) {
    check(`"${raw}" is out-of-state`, matchTeam({ raw }, index).outOfState === true);
  }
  // An Alabama school must not be swept up by a trailing token.
  check(
    "\"Homewood\" is not",
    matchTeam({ raw: "Homewood" }, index).outOfState === false,
  );
}

console.log("\n7. An alias for one school cannot capture another school's name");
{
  // Alias sources are expanded into every form suffix-stripping can reach, so
  // "Prattville Christian Academy" produces "prattville" among others — which
  // is a 6A school's entire name. For three weeks that sent Prattville's
  // games to a Single-A school two classifications away.
  //
  // The spelling decided it, which is why this went unnoticed: "Prattville
  // High School" survives normalization with its suffix intact and reaches
  // the roster on its own, while "Prattville HS" reduces straight to
  // "prattville" and landed on the alias.
  for (const raw of ["Prattville", "Prattville HS", "Prattville High School"]) {
    check(
      `"${raw}" is the 6A school`,
      matchTeam({ raw }, index).name === "Prattville",
      `${matchTeam({ raw }, index).name}`,
    );
  }
  for (const raw of [
    "Prattville Christian",
    "Prattville Christian Academy",
    "Prattville Christian HS",
  ]) {
    check(
      `"${raw}" is still the Single-A school`,
      matchTeam({ raw }, index).name === "Prattville Christian",
      `${matchTeam({ raw }, index).name}`,
    );
  }

  // The general rule, checked over the whole roster rather than the one name
  // that exposed it: no school's own name resolves to a different school.
  const stolen = teams.flatMap((t) =>
    [t.name, `${t.name} HS`, `${t.name} High School`]
      .map((raw) => ({ raw, got: matchTeam({ raw }, index).name, want: t.name }))
      .filter((r) => r.got && r.got !== r.want),
  );
  check(
    `no roster name resolves to a different school (${teams.length} schools)`,
    stolen.length === 0,
    stolen.map((s) => `"${s.raw}" → ${s.got}`).join("; "),
  );

  // And the aliases still do their job — the fix reorders them, so every
  // source spelling in the table has to keep landing on its target.
  const broken = Object.entries(ALIASES).filter(
    ([src, want]) => matchTeam({ raw: src }, index).name !== want,
  );
  check(
    `all ${Object.keys(ALIASES).length} alias sources still resolve`,
    broken.length === 0,
    broken.map(([s, w]) => `"${s}" wanted ${w}`).join("; "),
  );
}

console.log(
  failures === 0
    ? "\nThe name matcher behaves.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
