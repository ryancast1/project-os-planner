import assert from "node:assert/strict";
import { test } from "node:test";
import { getCompactOutcomeName, getTVOutcomeName } from "./outcomeLabels";

test("repeated Democrat margin choices shorten party names and preserve ranges", () => {
  const names = ["Republican Wins", "Democrat 0-5%", "Democrat 5-10%", "Democrat 35%+"];
  assert.deepEqual(names.map((name) => getCompactOutcomeName(name, names)), ["REP Wins", "DEM 0-5%", "DEM 5-10%", "DEM 35%+"]);
});

test("repeated Republican choices also trigger abbreviations for both parties", () => {
  const names = ["Democrat Wins", "Republican 0-5%", "Republican 5-10%"];
  assert.deepEqual(names.map((name) => getCompactOutcomeName(name, names)), ["DEM Wins", "REP 0-5%", "REP 5-10%"]);
});

test("ordinary two-party races and unrelated choices stay unchanged", () => {
  const names = ["Democrat", "Republican", "Other"];
  assert.deepEqual(names.map((name) => getCompactOutcomeName(name, names)), names);
  assert.equal(getCompactOutcomeName("Yes", ["Yes", "No"]), "Yes");
  assert.equal(getCompactOutcomeName("Candidate (D)", ["Candidate (D)", "Candidate (R)"]), "Candidate (D)");
});

test("party word variants are case insensitive and matched as whole words", () => {
  const names = ["DEMOCRATIC 10-15%", "Democrats 15-20%", "Republicans win", "Social Democrats 20%+"];
  assert.deepEqual(names.map((name) => getCompactOutcomeName(name, names)), ["DEM 10-15%", "DEM 15-20%", "REP win", "Social DEM 20%+"]);
  assert.equal(getCompactOutcomeName("Democratville", names), "Democratville");
});

test("full-market names can trigger shortening even when other choices are hidden", () => {
  assert.equal(getCompactOutcomeName("Democrat 15-20%", ["Democrat 15-20%", "Democrat 0-5%", "Republican Wins"]), "DEM 15-20%");
  assert.equal(getCompactOutcomeName("Democrat 15-20%", []), "Democrat 15-20%");
});

test("TV candidate labels use surnames only for explicitly party-tagged names", () => {
  const names = ["Peggy Flanagan (D)", "Michele Tafoya (R)"];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, names)), ["Flanagan", "Tafoya"]);
  assert.equal(getTVOutcomeName("James Talarico", ["James Talarico"]), "James Talarico");
  assert.equal(getCompactOutcomeName(names[0], names), names[0]);
});

test("candidate labels handle titles, middle initials, suffixes and compound surnames", () => {
  const names = ["Sen. Dan Sullivan (R)", "John E. Sununu (R)", "Chris Van Hollen (D)", "Robert F. Kennedy, Jr. (D)", "Mary O'Neill-Smith (D)", "Alex de la Cruz (R)"];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, names)), ["Sullivan", "Sununu", "Van Hollen", "Kennedy", "O'Neill-Smith", "de la Cruz"]);
});

test("TV does not guess surnames for party names, margins, placeholders or untagged labels", () => {
  const names = ["Republican Wins (R)", "Independent Candidate (D)", "Person A (R)", "Democrat 5-10%", "Yes", "No", "Other", "District 10 (D)"];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, [name])), names);
});

test("candidates sharing a surname retain distinguishing full labels", () => {
  const names = ["Chris Smith (D)", "John Smith (R)", "Jane Doe (D)"];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, names)), [names[0], names[1], "Doe"]);
});

test("TV margin abbreviations are preserved without surname extraction", () => {
  const names = ["Democrat 5-10%", "Democrat 10-15%", "Republican Wins"];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, names)), ["DEM 5-10%", "DEM 10-15%", "REP Wins"]);
});

test("TV abbreviates standalone party labels without changing full candidate or margin names", () => {
  const names = ["Democratic Party", "Democrat", "Democratic", "Republican Party", "Republican", "Independent", "Independent Party", "Independents", "Democratic Party (D)", "  republican party (R)  "];
  assert.deepEqual(names.map((name) => getTVOutcomeName(name, [name])), ["DEM", "DEM", "DEM", "REP", "REP", "IND", "IND", "IND", "DEM", "REP"]);
  assert.equal(getTVOutcomeName("Mary Peltola", ["Mary Peltola"]), "Mary Peltola");
  assert.equal(getTVOutcomeName("Democrat 5-10%", ["Democrat 5-10%"]), "Democrat 5-10%");
  assert.equal(getCompactOutcomeName("Democratic Party", ["Democratic Party", "Republican Party"]), "Democratic Party");
});
