import test from "node:test";
import assert from "node:assert/strict";
import { classify, escapeMd, formatSalary, formatPosted, formatLocation, buildSections, renderReadme, stripStamp, jobUrl } from "../scripts/lib.mjs";

const job = (o) => ({ id: o.slug, slug: "x", title: "T", company: "C", company_slug: "c", location: null, remote: false, salary_min: null, salary_max: null, salary_currency: null, seniority: "mid", ai_level: 3, posted_at: "2026-10-16T10:00:00Z", ...o });

test("classify range les offres dans une seule section", () => {
  assert.equal(classify(job({ title: "Machine Learning Intern" })), "internships");
  assert.equal(classify(job({ title: "Internal Tools Engineer, AI" })), "ai-ml-engineer");
  assert.equal(classify(job({ title: "Forward Deployed Engineer" })), "forward-deployed");
  assert.equal(classify(job({ title: "Research Scientist, LLMs" })), "research");
  assert.equal(classify(job({ title: "New Grad ML Engineer" })), "new-grad");
  assert.equal(classify(job({ title: "Data Scientist" })), "data");
  assert.equal(classify(job({ title: "Software Engineer", seniority: "junior" })), null);
  assert.equal(classify(job({ title: "Accountant" })), null);
});

test("escapeMd neutralise le Markdown, les tableaux et les tirets longs", () => {
  assert.equal(escapeMd("a | b\n[x](y) <b>"), "a \\| b \\[x\\](y) \\<b\\>");
  assert.equal(escapeMd("Role – Team — Site"), "Role - Team - Site");
});

test("formatSalary : annuel, horaire, absent", () => {
  assert.equal(formatSalary(job({ salary_min: 150000, salary_max: 400000, salary_currency: "USD" })), "$150k-$400k");
  assert.equal(formatSalary(job({ salary_min: 40, salary_max: 40, salary_currency: "USD" })), "$40/hr");
  assert.equal(formatSalary(job({})), "");
});

test("dates et lieux", () => {
  assert.equal(formatPosted("2026-10-09T23:07:09.000Z"), "Oct 9");
  assert.equal(formatLocation(job({ location: "Austin, Texas, United States of America", remote: true })), "Austin, Texas, US (Remote)");
  assert.equal(formatLocation(job({ remote: true })), "Remote");
});

test("le lien Apply pointe vers la fiche Level avec les UTM", () => {
  assert.equal(jobUrl("a-b"), "https://jobsbylevel.com/jobs/a-b?utm_source=github&utm_medium=list&utm_campaign=ai-jobs-list");
});

test("plafond par entreprise, déduplication et rendu stable hors horodatage", () => {
  const pool = Array.from({ length: 6 }, (_, i) => job({ id: `i${i}`, slug: `i${i}`, title: `Intern ${i}`, posted_at: `2026-10-1${i}T00:00:00Z` }));
  const sections = buildSections(pool, []);
  assert.equal(sections.get("internships").length, 4);
  const a = renderReadme(sections, new Date("2026-10-16T21:10:00Z"));
  const b = renderReadme(sections, new Date("2026-10-16T22:40:00Z"));
  assert.notEqual(a, b);
  assert.equal(stripStamp(a), stripStamp(b));
  assert.doesNotMatch(a, /[–—]/);
});
