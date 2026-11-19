import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderEntryLinks } from "./reader-shell-v1/entry-links.mjs";

const publicationRoot = path.dirname(fileURLToPath(import.meta.url));
const registryPath = "publication/entry-tags.json";
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const tagCapacity = alphabet.length ** 4;
const tagPattern = /^[0-9A-HJKMNP-TV-Z]{4}$/;
const entryPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+entry\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const tagFile = (root, tag) => path.join(root, "tag", tag, "index.html");
const tagPath = (tag) => `/tag/${tag}/`;

function validateRegistry(tags) {
  const byTag = new Map();
  const byEntry = new Map();
  for (const row of tags) {
    if (!Array.isArray(row) || row.length !== 2) throw new Error("Each tag record must have a tag and a destination or retirement notice.");
    const [tag, target] = row;
    if (typeof tag !== "string" || !tagPattern.test(tag) || byTag.has(tag)) throw new Error(`Invalid or repeated tag ${tag}.`);
    if (typeof target === "string" && entryPattern.test(target)) {
      if (byEntry.has(target)) throw new Error(`Multiple tags are assigned to ${target}.`);
      byEntry.set(target, tag);
    } else if (typeof target?.Retired !== "string" || !target.Retired.trim()) {
      throw new Error(`Tag ${tag} needs a public entry path or a nonempty retirement notice.`);
    }
    byTag.set(tag, target);
  }
  return { byTag, byEntry };
}

function loadRegistry(root, { allowNew = false } = {}) {
  const file = path.join(root, registryPath);
  const data = allowNew && !fs.existsSync(file) ? { SchemaVersion: 1, Tags: [] } : readJson(file);
  if (data.SchemaVersion !== 1 || !Array.isArray(data.Tags)) throw new Error("Unsupported entry-tag registry.");
  return validateRegistry(data.Tags);
}

export function entryPaths(publicBase, routes) {
  return new Map([...routes].filter((route) => route.Kind === "entry")
    .map((route) => [`${publicBase}${route.Path.slice(1)}`, route.Path]));
}

function validateCoverage(registry, entries, publicBase) {
  validateDestinations(registry, entries, publicBase);
  for (const entry of entries.keys()) {
    if (!registry.byEntry.has(entry)) throw new Error(`No tag assigned to ${entry}. Run node publication/entry-tags.mjs --allocate WORK_ID.`);
  }
}

function validateDestinations(registry, entries, publicBase) {
  for (const entry of registry.byEntry.keys()) {
    if (entry.startsWith(publicBase) && !entries.has(entry)) {
      throw new Error(`Tag ${registry.byEntry.get(entry)} points to missing entry ${entry}. Update its destination or record its retirement.`);
    }
  }
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderTagPage(tag, target) {
  const live = typeof target === "string";
  const redirect = live ? `<link rel="canonical" href="${target}">
  <script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
  <noscript><meta http-equiv="refresh" content="0; url=${target}"></noscript>` : "";
  const body = live ? `<a href="${target}">Open the entry for tag ${tag}</a>.` : escapeHtml(target.Retired);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tag ${tag}</title>
  ${redirect}
</head>
<body>
  <main>
    <h1>Tag ${tag}</h1>
    <p>${body}</p>
  </main>
</body>
</html>
`;
}

function validateTagFile(root, tag, target) {
  const file = tagFile(root, tag);
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== renderTagPage(tag, target)) {
    throw new Error(`Missing or stale page for tag ${tag}. Run node publication/entry-tags.mjs to regenerate tag pages.`);
  }
}

export function loadPublicationTags(root, publicBase, routes) {
  const registry = loadRegistry(root);
  validateReservedTags(root, registry);
  const entries = entryPaths(publicBase, routes);
  validateCoverage(registry, entries, publicBase);
  for (const [tag, target] of registry.byTag) {
    if (typeof target !== "string") validateTagFile(root, tag, target);
  }
  return [...entries].map(([entry, route]) => {
    const tag = registry.byEntry.get(entry);
    validateTagFile(root, tag, entry);
    return { entry, route, tag };
  });
}

export function installEntryLinks(stageRoot, canonicalBase, entries) {
  const assetDirectory = path.join(stageRoot, "_assets");
  fs.mkdirSync(assetDirectory, { recursive: true });
  for (const basename of ["entry-links.js", "entry-links.css"]) {
    fs.copyFileSync(path.join(publicationRoot, "reader-shell-v1", basename), path.join(assetDirectory, basename));
  }
  for (const { entry, route, tag } of entries) {
    const file = path.join(stageRoot, ...route.split("/").filter(Boolean), "index.html");
    const html = fs.readFileSync(file, "utf8");
    const heading = /<h1\b[^>]*>[\s\S]*?<\/h1>/gi;
    if ([...html.matchAll(heading)].length !== 1 || !html.includes("</head>") || html.includes("data-entry-links")) {
      throw new Error(`Cannot install tag links on ${entry}. Expected one heading and no existing entry link controls.`);
    }
    const assets = path.posix.relative(route, "/_assets");
    const tagUrl = new URL(tagPath(tag), canonicalBase).href;
    const entryUrl = new URL(entry, canonicalBase).href;
    const updated = html.replace(heading, (title) => `${title}\n${renderEntryLinks(tag, tagUrl, entryUrl)}`)
      .replace("</head>", `<link rel="stylesheet" href="${assets}/entry-links.css">\n<script defer src="${assets}/entry-links.js"></script>\n</head>`);
    fs.writeFileSync(file, updated);
  }
}

function validateReservedTags(root, registry) {
  const directory = path.join(root, "tag");
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isDirectory() && tagPattern.test(item.name) && !registry.byTag.has(item.name)) {
      throw new Error(`Published tag ${item.name} was removed from the registry. Record its retirement instead.`);
    }
  }
}

function decodeTag(tag) {
  return [...tag].reduce((value, digit) => value * alphabet.length + alphabet.indexOf(digit), 0);
}

function nextTagNumber(issued, start = 1, end = tagCapacity) {
  let next = start;
  for (const number of issued) {
    if (number >= next && number < end) next = number + 1;
  }
  return next;
}

function encodeTag(number) {
  if (number >= tagCapacity) throw new Error("No further four-character tags can be allocated.");
  return [...number.toString(alphabet.length).padStart(4, "0")]
    .map((digit) => alphabet[Number.parseInt(digit, alphabet.length)]).join("");
}

function registeredWorks(root) {
  const directory = path.join(root, "publication", "works");
  return new Map(fs.readdirSync(directory).filter((file) => file.endsWith(".json")).map((file) => readJson(path.join(directory, file)))
    .filter((work) => work.EntryTags === true).map((work) => [work.WorkId, work]));
}

function allocationRanges(works) {
  const starts = [...works.values()].filter((work) => Object.hasOwn(work, "EntryTagStart"))
    .map(({ WorkId, EntryTagStart }) => {
      if (typeof EntryTagStart !== "string" || !tagPattern.test(EntryTagStart) || EntryTagStart === "0000") {
        throw new Error(`Invalid EntryTagStart for ${WorkId}.`);
      }
      return { id: WorkId, start: decodeTag(EntryTagStart) };
    }).sort((left, right) => left.start - right.start);
  return new Map(starts.map(({ id, start }, index) => {
    const end = starts[index + 1]?.start ?? tagCapacity;
    if (start === end) throw new Error(`EntryTagStart ${encodeTag(start)} is assigned to multiple works.`);
    return [id, { start, end }];
  }));
}

function workEntries(root, work, bundle) {
  const contract = readJson(path.resolve(root, bundle, "_meta", "public-contract.json"));
  if (contract.SchemaVersion !== 1 || contract.WorkId !== work.WorkId || new URL(contract.CanonicalBase).pathname !== work.PublicBase) {
    throw new Error(`The public contract does not match ${work.WorkId}.`);
  }
  return entryPaths(work.PublicBase, contract.Routes);
}

function orderedCandidateEntries(root, work, entries) {
  const navigation = readJson(path.resolve(root, work.SourceBundle, "_meta", "reading-navigation.json"));
  if (!Array.isArray(navigation.entries)) throw new Error(`Missing entry reading order for ${work.WorkId}.`);
  const ordered = new Set();
  for (const { page } of navigation.entries) {
    const entry = typeof page === "string" && page.endsWith("/index.html")
      ? work.PublicBase + page.slice(0, -"index.html".length)
      : null;
    if (!entries.has(entry) || ordered.has(entry)) {
      throw new Error(`Unknown or repeated entry in the reading order for ${work.WorkId}: ${page}.`);
    }
    ordered.add(entry);
  }
  if (ordered.size !== entries.size) throw new Error(`The reading order for ${work.WorkId} does not cover every entry.`);
  return ordered;
}

export function manageEntryTags(root, { allocate = [], check = false } = {}) {
  if (check) return updateEntryTags(root, [], true);
  const lock = path.join(root, `${registryPath}.__updating__`);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`Another tag update is in progress. If the process was interrupted, remove the empty lock directory ${lock} before retrying.`);
  }
  try {
    return updateEntryTags(root, allocate, false);
  } finally {
    fs.rmdirSync(lock);
  }
}

function updateEntryTags(root, allocate, check) {
  const registry = loadRegistry(root, { allowNew: allocate.length > 0 });
  validateReservedTags(root, registry);
  const works = registeredWorks(root);
  let added = 0;
  if (allocate.length) {
    const ranges = allocationRanges(works);
    const issued = [...registry.byTag.keys()].map(decodeTag);
    let nextSiteTag = nextTagNumber(issued);
    for (const id of new Set(allocate)) {
      const work = works.get(id);
      if (!work) throw new Error(`Entry tags are disabled for ${id}.`);
      const entries = workEntries(root, work, work.SourceBundle);
      validateDestinations(registry, entries, work.PublicBase);
      const { start = 1, end = tagCapacity } = ranges.get(id) ?? {};
      let next = nextTagNumber(issued, start, end);
      for (const entry of orderedCandidateEntries(root, work, entries)) {
        if (registry.byEntry.has(entry)) continue;
        const number = next < end ? next++ : nextSiteTag;
        registry.byTag.set(encodeTag(number), entry);
        issued.push(number);
        nextSiteTag = Math.max(nextSiteTag, number + 1);
        added += 1;
      }
    }
    if (added) {
      const rows = [...registry.byTag].sort(([left], [right]) => left.localeCompare(right, "en"))
        .map((row) => `    ${JSON.stringify(row)}`);
      const stagedRegistry = path.join(root, `${registryPath}.__updating__`, "registry.json");
      try {
        fs.writeFileSync(stagedRegistry, `{\n  "SchemaVersion": 1,\n  "Tags": [\n${rows.join(",\n")}\n  ]\n}\n`);
        fs.renameSync(stagedRegistry, path.join(root, registryPath));
      } finally {
        fs.rmSync(stagedRegistry, { force: true });
      }
    }
  }
  for (const [tag, target] of registry.byTag) {
    if (typeof target === "string" && ![...works.values()].some((work) => target.startsWith(work.PublicBase))) {
      throw new Error(`Tag ${tag} points outside the tagged editions: ${target}.`);
    }
    if (check) {
      validateTagFile(root, tag, target);
    } else {
      const file = tagFile(root, tag);
      const page = renderTagPage(tag, target);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== page) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, page);
      }
    }
  }
  if (check) {
    for (const work of works.values()) {
      validateCoverage(registry, workEntries(root, work, work.PublicDirectory), work.PublicBase);
    }
  }
  return { total: registry.byTag.size, added };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [option, ...workIds] = process.argv.slice(2);
  if (option && !(option === "--allocate" && workIds.length > 0) && !(option === "--check" && workIds.length === 0)) {
    throw new Error("Usage: node publication/entry-tags.mjs [--allocate WORK_ID ... | --check]");
  }
  const { total, added } = manageEntryTags(path.resolve(publicationRoot, ".."), { allocate: workIds, check: option === "--check" });
  console.log(`${option === "--check" ? "Validated" : "Generated"} ${total} tag routes${added ? `, including ${added} new tags` : ""}.`);
}
