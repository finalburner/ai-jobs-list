// Logique pure du générateur : classement, formatage et rendu Markdown.
// Aucune entrée/sortie ici, pour pouvoir la tester seule (voir test/).

export const SITE = "https://jobsbylevel.com";
export const UTM = "utm_source=github&utm_medium=list&utm_campaign=ai-jobs-list";

/** Noms des niveaux, identiques à ceux affichés sur jobsbylevel.com. */
export const LEVELS = {
  4: { name: "Builds AI", gauge: "●●●●" },
  3: { name: "Works on AI", gauge: "●●●○" },
  2: { name: "Uses AI", gauge: "●●○○" },
  1: { name: "Little AI", gauge: "●○○○" },
};

/**
 * Sections du README, dans l'ordre d'affichage. `cap` = nombre maximal de
 * lignes, `perCompany` = plafond d'offres par entreprise dans la section
 * (évite qu'un seul employeur remplisse un tableau).
 */
export const SECTIONS = [
  { id: "internships", title: "Internships", cap: 70, perCompany: 4 },
  { id: "new-grad", title: "New grad and entry level", cap: 50, perCompany: 4 },
  { id: "ai-ml-engineer", title: "AI/ML engineer", cap: 60, perCompany: 4 },
  { id: "research", title: "Research", cap: 40, perCompany: 4 },
  { id: "data", title: "Data", cap: 40, perCompany: 4 },
  { id: "forward-deployed", title: "Forward deployed", cap: 30, perCompany: 4 },
  { id: "remote", title: "Remote", cap: 40, perCompany: 3 },
];

const RE_INTERN = /\b(interns?|internships?|co-?ops?|apprentices?|apprenticeships?|working students?|werkstudent(en)?|stagiaires?|praktikum|praktikant(in)?)\b/i;
const RE_NEW_GRAD = /\b(new[- ]?grads?|graduates?|early[- ]career|entry[- ]level|junior|jr\.?|university (grad|hire|recruit)\w*|college hire)\b/i;
const RE_FDE = /forward[- ]deployed/i;
const RE_RESEARCH = /\b(research (scientist|engineer|scholar|fellow|lead)|researcher|applied scientist|research)\b/i;
const RE_AIML = /\b(machine learning|ml|ai|a\.i\.|llm|llms|deep learning|computer vision|nlp|generative|genai|gen ai|mlops|ai\/ml|applied ai|prompt|inference|agents?|agentic)\b/i;
const RE_ENGINEERISH = /\b(engineer|developer|architect|scientist|member of technical staff|mts)\b/i;
const RE_DATA = /\b(data\s+(scientist|engineer|analyst|science|analytics)|analytics engineer|data\s+and\s+ai)\b/i;

/** Section « principale » d'une offre (une seule), ou null si hors périmètre. */
export function classify(job) {
  const title = job.title ?? "";
  if (job.seniority === "intern" || RE_INTERN.test(title)) return "internships";
  if (RE_FDE.test(title)) return "forward-deployed";
  const research = RE_RESEARCH.test(title) && !RE_DATA.test(title);
  const aiml = RE_AIML.test(title) && RE_ENGINEERISH.test(title);
  const data = RE_DATA.test(title);
  // Le niveau « junior » du catalogue est bruité : on ne le retient que pour un métier IA, données ou recherche.
  if (RE_NEW_GRAD.test(title) || (job.seniority === "junior" && (research || aiml || data))) return "new-grad";
  if (research) return "research";
  if (aiml) return "ai-ml-engineer";
  if (data) return "data";
  return null;
}

/** Échappe le texte venant de tiers pour qu'il reste du texte dans le Markdown. */
export function escapeMd(value) {
  return String(value ?? "")
    .replace(/\s*[\u2013\u2014]\s*/g, " - ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]<>|~]/g, (c) => `\\${c}`)
    .replace(/&(?=#?\w+;)/g, "&amp;");
}

function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatLocation(job) {
  let loc = (job.location ?? "").replace(/United States of America|United States/gi, "US").replace(/\s+/g, " ").trim();
  loc = truncate(loc, 40);
  if (job.remote && !/remote/i.test(loc)) loc = loc ? `${loc} (Remote)` : "Remote";
  return escapeMd(loc);
}

export function formatLevel(level) {
  const l = LEVELS[level];
  return l ? `${l.name} ${l.gauge}` : "";
}

const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", CHF: "CHF " };

function amount(n, symbol, hourly) {
  if (hourly) return `${symbol}${Math.round(n)}`;
  return n >= 1000 ? `${symbol}${Math.round(n / 1000)}k` : `${symbol}${Math.round(n)}`;
}

/**
 * Salaire tel que publié par l'employeur, ou chaîne vide. Une valeur sous 500
 * est lue comme un taux horaire (heuristique : le catalogue ne porte pas
 * l'unité), au-dessus comme un montant annuel.
 */
export function formatSalary(job) {
  const lo = job.salary_min;
  const hi = job.salary_max;
  const value = hi ?? lo;
  if (value == null || value <= 0) return "";
  const symbol = SYMBOLS[job.salary_currency] ?? (job.salary_currency ? `${job.salary_currency} ` : "");
  const hourly = value < 500;
  const a = lo == null ? hi : lo;
  const b = hi == null ? lo : hi;
  const range = a === b ? amount(a, symbol, hourly) : `${amount(a, symbol, hourly)}-${amount(b, symbol, hourly)}`;
  return hourly ? `${range}/hr` : range;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** « Oct 16 » en UTC, stable d'une exécution à l'autre (pas de date relative). */
export function formatPosted(iso) {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function jobUrl(slug) {
  return `${SITE}/jobs/${encodeURIComponent(slug)}?${UTM}`;
}

function row(job) {
  const title = escapeMd(truncate(job.title ?? "", 90));
  return `| ${escapeMd(job.company)} | ${title} | ${formatLocation(job)} | ${formatLevel(job.ai_level)} | ${formatSalary(job)} | ${formatPosted(job.posted_at)} | [Apply](${jobUrl(job.slug)}) |`;
}

const byFreshness = (a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "") || b.ai_level - a.ai_level || a.slug.localeCompare(b.slug);

/** Répartit les offres dans les sections, trie par fraîcheur et applique les plafonds. */
export function buildSections(pool, remotePool) {
  const result = new Map(SECTIONS.map((s) => [s.id, []]));
  const seen = new Set();
  for (const job of [...pool].sort(byFreshness)) {
    if (seen.has(job.id)) continue;
    const id = classify(job);
    if (!id) continue;
    seen.add(job.id);
    result.get(id).push(job);
  }
  const remote = [...remotePool].filter((j) => j.remote).sort(byFreshness);
  result.get("remote").push(...remote);

  for (const section of SECTIONS) {
    const perCompany = new Map();
    const kept = [];
    const dupes = new Set();
    for (const job of result.get(section.id)) {
      const key = `${job.company_slug}|${job.title}`;
      if (dupes.has(key)) continue;
      dupes.add(key);
      const n = perCompany.get(job.company_slug) ?? 0;
      if (n >= section.perCompany) continue;
      perCompany.set(job.company_slug, n + 1);
      kept.push(job);
      if (kept.length >= section.cap) break;
    }
    result.set(section.id, kept);
  }
  return result;
}

export function distinctCount(sections) {
  const ids = new Set();
  for (const jobs of sections.values()) for (const j of jobs) ids.add(j.id);
  return ids.size;
}

export const STAMP_MARK = "<!--stamp-->";

/** Rend le README. `now` est une Date ; elle ne sert qu'aux lignes marquées. */
export function renderReadme(sections, now) {
  const total = distinctCount(sections);
  const date = `${MONTHS[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`;
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const stamp = `${date} ${hh}:00 UTC`;
  const badgeDate = `${now.getUTCFullYear()}--${String(now.getUTCMonth() + 1).padStart(2, "0")}--${String(now.getUTCDate()).padStart(2, "0")}`;

  const out = [];
  out.push("# AI/ML jobs and internships");
  out.push("");
  out.push(
    `[![Open roles](https://img.shields.io/badge/open%20roles-${total}-2563eb)](${SITE}/?${UTM}) ` +
      `[![Updated](https://img.shields.io/badge/updated-${badgeDate}-555555)](#) ` +
      "[![Refreshed hourly](https://img.shields.io/badge/refresh-hourly-16a34a)](.github/workflows/update.yml) " +
      "[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-lightgrey)](LICENSE)",
  );
  out.push("");
  out.push(
    `A short, fresh list of AI and machine learning jobs, internships and new grad roles. It is rebuilt every hour from the public data of [Level](${SITE}/?${UTM}), ` +
      "the job board that shows how much AI each job involves. Every row links to its Level page, where you can read the full posting and apply.",
  );
  out.push("");
  out.push(`Last updated: ${STAMP_MARK}${stamp}${STAMP_MARK}. ${total} roles listed, newest first in each table.`);
  out.push("");
  out.push("**AI level** shows how central AI is to the job: Builds AI ●●●●, Works on AI ●●●○, Uses AI ●●○○, Little AI ●○○○. [How Level measures it](" + `${SITE}/method?${UTM}).`);
  out.push("");
  out.push("## Contents");
  out.push("");
  for (const s of SECTIONS) out.push(`- [${s.title}](#${s.id}) (${sections.get(s.id).length})`);
  out.push("- [Get alerts](#get-alerts)");
  out.push("- [Contribute](#contribute)");
  out.push("- [About the data and license](#about-the-data-and-license)");
  out.push("");

  for (const s of SECTIONS) {
    const jobs = sections.get(s.id);
    out.push(`<a id="${s.id}"></a>`);
    out.push("");
    out.push(`## ${s.title}`);
    out.push("");
    if (jobs.length === 0) {
      out.push("No matching roles right now. Check back after the next hourly update.");
      out.push("");
      continue;
    }
    out.push("| Company | Role | Location | AI level | Salary | Posted | Apply |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const job of jobs) out.push(row(job));
    out.push("");
  }

  out.push('<a id="get-alerts"></a>');
  out.push("");
  out.push("## Get alerts");
  out.push("");
  out.push(`Want new roles in your inbox instead of checking this page? [Get job alerts on Level](${SITE}/job-alerts?${UTM}) and pick your filters. Employers can [post a job](${SITE}/post-a-job?${UTM}) on Level.`);
  out.push("");
  out.push('<a id="contribute"></a>');
  out.push("");
  out.push("## Contribute");
  out.push("");
  out.push("The list is generated, so please do not edit `README.md` by hand. Found a role that is closed, duplicated or in the wrong table? [Open an issue](../../issues/new?template=closed-job.yml) with the link to its Level page and we will fix it at the source. Improvements to the generator in `scripts/` are welcome as pull requests.");
  out.push("");
  out.push('<a id="about-the-data-and-license"></a>');
  out.push("");
  out.push("## About the data and license");
  out.push("");
  out.push(
    `Job data comes from the public [Level API](${SITE}/developers?${UTM}) (no key, no scraping). Salaries appear only when the employer published one in the posting; amounts under 500 are shown per hour, others per year. ` +
      "Data in this repository is licensed under [CC BY 4.0](LICENSE): please credit \"Level (jobsbylevel.com)\" with a link back. The code in `scripts/` is under the MIT license.",
  );
  out.push("");
  return out.join("\n");
}

/** Texte du README sans les horodatages, pour décider s'il y a un vrai changement. */
export function stripStamp(text) {
  return text
    .replace(new RegExp(`${STAMP_MARK}.*?${STAMP_MARK}`, "g"), "")
    .replace(/updated-\d{4}--\d{2}--\d{2}/g, "updated-");
}
