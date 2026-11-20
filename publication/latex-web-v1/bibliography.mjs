function readGroup(text, start) {
  let cursor = start;
  while (/\s/.test(text[cursor] || "")) cursor += 1;
  if (text[cursor] !== "{") throw new Error(`Expected a bibliography group at offset ${cursor}.`);
  let depth = 1;
  let escaped = false;
  for (let index = cursor + 1; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return { value: text.slice(cursor + 1, index), end: index + 1 };
  }
  throw new Error(`Unclosed bibliography group at offset ${cursor}.`);
}

function readCommandGroups(text, commandOffset, count) {
  let cursor = commandOffset;
  const groups = [];
  for (let index = 0; index < count; index += 1) {
    const group = readGroup(text, cursor);
    groups.push(group.value);
    cursor = group.end;
  }
  return { groups, end: cursor };
}

function topLevelGroups(text) {
  const groups = [];
  let cursor = 0;
  while (cursor < text.length) {
    while (cursor < text.length && (/\s/.test(text[cursor]) || text[cursor] === "%")) cursor += 1;
    if (cursor >= text.length) break;
    if (text[cursor] !== "{") {
      cursor += 1;
      continue;
    }
    const group = readGroup(text, cursor);
    groups.push(group.value);
    cursor = group.end;
  }
  return groups;
}

function namedValue(text, name) {
  const match = new RegExp(`(?:^|[,\\s{])${name}=\\s*\\{`).exec(text);
  if (!match) return "";
  const openingBrace = text.indexOf("{", match.index + match[0].length - 1);
  return readGroup(text, openingBrace).value;
}

function latexToText(value, { trim = true } = {}) {
  const accents = {
    "'": { a: "á", A: "Á", e: "é", E: "É", i: "í", I: "Í", o: "ó", O: "Ó", u: "ú", U: "Ú", y: "ý", Y: "Ý" },
    "`": { a: "à", A: "À", e: "è", E: "È", i: "ì", I: "Ì", o: "ò", O: "Ò", u: "ù", U: "Ù" },
    "\"": { a: "ä", A: "Ä", e: "ë", E: "Ë", i: "ï", I: "Ï", o: "ö", O: "Ö", u: "ü", U: "Ü", y: "ÿ", Y: "Ÿ" },
    "~": { a: "ã", A: "Ã", n: "ñ", N: "Ñ", o: "õ", O: "Õ" },
    "^": { a: "â", A: "Â", e: "ê", E: "Ê", i: "î", I: "Î", o: "ô", O: "Ô", u: "û", U: "Û" }
  };
  let text = value
    .replace(/%\s*\r?\n/g, "")
    .replace(/\\bibinitperiod\b/g, ".")
    .replace(/\\bibnamedelim[a-di]\b\s*/g, " ")
    .replace(/\\bibinitdelim\b\s*/g, " ")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/\\bibrangedash\b\s*/g, "–")
    .replace(/\\\(\\infty\\\)|\$\\infty\$/g, "∞")
    .replace(/\\url\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:emph|textit|textup|textnormal|mkbibquote)\{([^{}]*)\}/g, "$1")
    .replace(/\\ae\b/g, "æ").replace(/\\AE\b/g, "Æ")
    .replace(/\\oe\b/g, "œ").replace(/\\OE\b/g, "Œ")
    .replace(/\\aa\b/g, "å").replace(/\\AA\b/g, "Å")
    .replace(/\\o\b/g, "ø").replace(/\\O\b/g, "Ø")
    .replace(/\\ss\b/g, "ß");
  text = text.replace(/\\([`'"~^])\s*\{?([A-Za-z])\}?/g, (_, accent, letter) => accents[accent]?.[letter] || letter);
  text = text.replace(/[{}]/g, "").replace(/\\([#$%&_])/g, "$1").replace(/\s+/g, " ");
  return trim ? text.trim() : text;
}

function parseNames(entryBody) {
  const marker = "\\name{author}";
  const start = entryBody.indexOf(marker);
  if (start < 0) return [];
  const { groups } = readCommandGroups(entryBody, start + "\\name".length, 4);
  return topLevelGroups(groups[3]).map((nameBlock) => ({
    family: latexToText(namedValue(nameBlock, "family")),
    given: latexToText(namedValue(nameBlock, "given")),
    prefix: latexToText(namedValue(nameBlock, "prefix")),
    suffix: latexToText(namedValue(nameBlock, "suffix"))
  })).filter((name) => name.family || name.given);
}

function parseFields(entryBody, { raw = false } = {}) {
  const fields = {};
  const pattern = /\\field\{/g;
  for (let match; (match = pattern.exec(entryBody)); ) {
    const { groups, end } = readCommandGroups(entryBody, match.index + "\\field".length, 2);
    fields[groups[0]] = raw ? groups[1] : latexToText(groups[1]);
    pattern.lastIndex = end;
  }
  return fields;
}

function parseVerbatims(entryBody) {
  const verbatims = {};
  for (const match of entryBody.matchAll(/\\verb\{([a-z]+)\}\s*\\verb ([^\r\n]*)\r?\n\s*\\endverb/g)) {
    verbatims[match[1]] = match[2].trim();
  }
  return verbatims;
}

function parseLists(entryBody) {
  const lists = {};
  const pattern = /\\list\{([a-z]+)\}\{\d+\}\{%?/g;
  for (let match; (match = pattern.exec(entryBody)); ) {
    const opening = entryBody.lastIndexOf("{", match.index + match[0].length);
    const group = readGroup(entryBody, opening);
    lists[match[1]] = topLevelGroups(group.value).map(latexToText);
    pattern.lastIndex = group.end;
  }
  return lists;
}

export function parseBbl(source) {
  const entries = new Map();
  const entryPattern = /\\entry\{/g;
  for (let match; (match = entryPattern.exec(source)); ) {
    const { groups, end } = readCommandGroups(source, match.index + "\\entry".length, 3);
    const bodyEnd = source.indexOf("\\endentry", end);
    if (bodyEnd < 0) throw new Error(`Missing \\endentry for ${groups[0]}.`);
    const body = source.slice(end, bodyEnd);
    const fields = parseFields(body);
    entries.set(groups[0], {
      key: groups[0],
      type: groups[1],
      order: entries.size,
      authorNames: parseNames(body),
      year: fields.year || fields.date || "",
      title: fields.title || "",
      label: fields.label || fields.shorthand || "",
      fields,
      rawFields: parseFields(body, { raw: true }),
      verbatims: parseVerbatims(body),
      lists: parseLists(body)
    });
    entryPattern.lastIndex = bodyEnd + "\\endentry".length;
  }
  return entries;
}

export function citationName(entry) {
  const families = entry?.authorNames.map((name) => [name.prefix, name.family].filter(Boolean).join(" ")).filter(Boolean) || [];
  if (families.length === 1) return families[0];
  if (families.length === 2) return `${families[0]} and ${families[1]}`;
  if (families.length > 2) return `${families[0]} et al.`;
  return entry?.label || entry?.key || "Reference";
}


// The web edition cites by author and year. When two cited works share both,
// BibLaTeX's alphabetic labels already order them (extraalpha), and that order
// supplies the distinguishing letter, as in "Lurie (2009a)".
export function citationYear(entry, bibliography) {
  if (!entry?.year) return "";
  const name = citationName(entry);
  const homonyms = [...bibliography.values()]
    .filter((candidate) => candidate.year === entry.year && citationName(candidate) === name)
    .sort((left, right) => left.order - right.order);
  if (homonyms.length < 2) return entry.year;
  const index = homonyms.findIndex((candidate) => candidate.key === entry.key);
  return `${entry.year}${String.fromCharCode(97 + Math.max(index, 0))}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Converts a raw BibLaTeX field to HTML, keeping inline mathematics for MathJax.
export function latexToHtml(value) {
  const pieces = String(value || "")
    .replace(/\$([^$]+)\$/g, "\\($1\\)")
    .split(/(\\\([\s\S]*?\\\))/g);
  // Mathematics is handed to MathJax verbatim; BibTeX's case-protection braces
  // around it are harmless TeX groups. Text pieces are converted to Unicode.
  return pieces.map((piece) => piece.startsWith("\\(")
    ? escapeHtml(piece)
    : escapeHtml(latexToText(piece, { trim: false }))
  ).join("").replace(/\s+/g, " ").trim();
}

function fullName(name) {
  return [name.given, name.prefix, name.family, name.suffix].filter(Boolean).join(" ");
}

function joinNames(names) {
  const rendered = names.map(fullName);
  if (rendered.length <= 1) return rendered.join("");
  return `${rendered.slice(0, -1).join(", ")} and ${rendered.at(-1)}`;
}

function arxivIdentifier(entry) {
  if ((entry.fields.eprinttype || "").toLowerCase() === "arxiv" && entry.verbatims.eprint) return entry.verbatims.eprint;
  const fromText = `${entry.fields.howpublished || ""} ${entry.fields.note || ""}`.match(/arXiv:\s*([0-9]{4}\.[0-9]{4,5}|[a-z-]+\/[0-9]{7})/i);
  if (fromText) return fromText[1];
  const fromUrl = (entry.verbatims.url || "").match(/arxiv\.org\/abs\/([^\s?#]+)/);
  return fromUrl ? fromUrl[1] : "";
}

// Renders one reference in the house style of the printed bibliography:
// authors, title, then the publication data, followed by DOI and arXiv links.
export function renderReferenceHtml(entry) {
  const raw = entry.rawFields;
  const fields = entry.fields;
  const parts = [];
  const authors = joinNames(entry.authorNames);
  const isMonograph = entry.type === "book" || (entry.type === "misc" && !arxivIdentifier(entry));
  // Titles may end in their own full stop; the separator adds one.
  const title = raw.title ? latexToHtml(raw.title).replace(/\.$/, "") : "";
  const publication = [];
  if (entry.type === "article") {
    let journal = fields.journaltitle ? `<span class="reference-venue">${escapeHtml(fields.journaltitle)}</span>` : "";
    if (fields.volume) journal += ` ${escapeHtml(fields.volume)}`;
    if (fields.number) journal += `.${escapeHtml(fields.number)}`;
    if (journal) publication.push(journal);
  } else if (entry.type === "incollection" || entry.type === "inproceedings") {
    if (raw.booktitle) publication.push(`In <span class="reference-venue">${latexToHtml(raw.booktitle)}</span>`);
  } else if (fields.series) {
    publication.push(`${escapeHtml(fields.series)}${fields.volume ? ` ${escapeHtml(fields.volume)}` : ""}`);
  }
  if (entry.lists.publisher?.length) publication.push(escapeHtml(entry.lists.publisher.join(", ")));
  if (fields.howpublished && !/^Preprint,\s*arXiv:/i.test(fields.howpublished)) {
    publication.push(escapeHtml(fields.howpublished.replace(/\s*\(\d{4}\)\.?$/, "").replace(/\.$/, "")));
  }
  if (fields.edition) publication.push(`${escapeHtml(fields.edition)} edition`);
  const arxiv = arxivIdentifier(entry);
  if (!arxiv || entry.type !== "misc") {
    if (entry.year) publication.push(escapeHtml(entry.year));
  } else {
    publication.push(`preprint, ${escapeHtml(entry.year)}`);
  }
  if (fields.pages) publication.push(`pp. ${escapeHtml(fields.pages)}`);
  if (fields.note) publication.push(escapeHtml(fields.note));
  if (authors) parts.push(`<span class="reference-authors">${escapeHtml(authors)}</span>`);
  if (title) parts.push(isMonograph ? `<cite>${title}</cite>` : `<span class="reference-title">${title}</span>`);
  if (publication.length) parts.push(publication.join(", "));
  const links = [];
  if (entry.verbatims.doi) links.push(`<a href="https://doi.org/${escapeHtml(entry.verbatims.doi)}">doi:${escapeHtml(entry.verbatims.doi)}</a>`);
  if (arxiv) links.push(`<a href="https://arxiv.org/abs/${escapeHtml(arxiv)}">arXiv:${escapeHtml(arxiv)}</a>`);
  const url = entry.verbatims.url || "";
  if (url && !/doi\.org|arxiv\.org/.test(url)) links.push(`<a href="${escapeHtml(url)}">${escapeHtml(url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`);
  return `${parts.join(". ")}.${links.length ? ` <span class="reference-links">${links.join(" · ")}</span>` : ""}`;
}

export function alphabeticLabel(entry) {
  const label = entry.fields.labelalpha || entry.label || entry.key;
  const extra = Number(entry.fields.extraalpha || 0);
  return extra ? `${label}${String.fromCharCode(96 + extra)}` : label;
}
