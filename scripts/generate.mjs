#!/usr/bin/env node
// Génère README.md à partir de l'API publique de Level (sans clé, sans dépendance).
//   node scripts/generate.mjs            écrit README.md si le contenu a changé
//   node scripts/generate.mjs --stdout   affiche le résultat sans rien écrire
// Variables : LEVEL_API_BASE (défaut https://jobsbylevel.com), MIN_LEVEL (défaut 3).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildSections, distinctCount, renderReadme, stripStamp, SECTIONS } from "./lib.mjs";

const API = (process.env.LEVEL_API_BASE ?? "https://jobsbylevel.com").replace(/\/$/, "");
const MIN_LEVEL = Number(process.env.MIN_LEVEL ?? 3);
const MAX_AGE_DAYS = 30;
const PACE_MS = 1300; // l'API publique accepte 60 requêtes par minute et par IP
const readmePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "README.md");

// Requêtes plein texte envoyées à l'API ; le classement fin se fait ensuite dans lib.mjs.
const QUERIES = [
  { q: "intern", pages: 6 },
  { q: "internship", pages: 3 },
  { q: "co-op", pages: 1 },
  { q: "new grad", pages: 1 },
  { q: "graduate", pages: 3 },
  { q: "entry level", pages: 2 },
  { q: "early career", pages: 1 },
  { q: "junior", pages: 1 },
  { q: "machine learning engineer", pages: 5 },
  { q: "AI engineer", pages: 4 },
  { q: "ML engineer", pages: 2 },
  { q: "LLM engineer", pages: 2 },
  { q: "research scientist", pages: 3 },
  { q: "research engineer", pages: 3 },
  { q: "data scientist", pages: 3 },
  { q: "data engineer", pages: 3 },
  { q: "forward deployed", pages: 3 },
];
const REMOTE_QUERY = { remote: "1", pages: 4 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

async function fetchPage(params, attempt = 1) {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = `${API}/api/v1/jobs?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "User-Agent": "level-ai-jobs-list (github.com list generator)" } });
  if (res.status === 429 && attempt <= 4) {
    const retry = Number(res.headers.get("retry-after")) || 20;
    await sleep(retry * 1000 + 500);
    return fetchPage(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`API ${res.status} pour ${url}`);
  return res.json();
}

async function collect(base, pages) {
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const body = await fetchPage({ ...base, sort: "recent", ai_level_min: String(MIN_LEVEL), page: String(page) });
    items.push(...body.items);
    if (body.items.length < body.per_page) break;
  }
  return items;
}

async function main() {
  const pool = new Map();
  const remote = new Map();
  let failures = 0;
  for (const { q, pages } of QUERIES) {
    try {
      for (const job of await collect({ query: q }, pages)) pool.set(job.id, job);
    } catch (err) {
      failures++;
      console.error(`Requête « ${q} » ignorée : ${err.message}`);
    }
  }
  try {
    for (const job of await collect({ remote: REMOTE_QUERY.remote }, REMOTE_QUERY.pages)) remote.set(job.id, job);
  } catch (err) {
    failures++;
    console.error(`Requête remote ignorée : ${err.message}`);
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = (j) => j.posted_at && new Date(j.posted_at).getTime() >= cutoff;
  const sections = buildSections([...pool.values()].filter(fresh), [...remote.values()].filter(fresh));

  // Garde-fou : ne jamais publier un README vide ou très appauvri à cause d'une panne.
  const total = distinctCount(sections);
  if (failures > QUERIES.length / 2 || total < 30) {
    throw new Error(`Données insuffisantes (${total} offres, ${failures} requêtes en échec) : README inchangé.`);
  }

  const now = new Date();
  const next = renderReadme(sections, now);
  const counts = SECTIONS.map((s) => `${s.id}=${sections.get(s.id).length}`).join(" ");
  console.error(`Offres distinctes : ${total} (${counts}); pool API : ${pool.size + remote.size}`);

  if (process.argv.includes("--stdout")) {
    process.stdout.write(next);
    return;
  }
  let previous = "";
  try {
    previous = await readFile(readmePath, "utf8");
  } catch {}
  if (stripStamp(previous) === stripStamp(next)) {
    console.error("Aucun changement de contenu : README conservé.");
    return;
  }
  await writeFile(readmePath, next);
  console.error("README.md mis à jour.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
