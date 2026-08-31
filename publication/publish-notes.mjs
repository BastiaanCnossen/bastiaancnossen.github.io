import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultWebsiteRoot = path.resolve(moduleDirectory, "..");

function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${description} at ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertManagedPath(websiteRoot, target, description) {
  const resolvedRoot = path.resolve(websiteRoot);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to manage ${description} outside the website repository: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

function normalizePublicBase(value) {
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(value)) {
    throw new Error(`Invalid public base ${value}. Use a lower-case absolute directory path ending in /.`);
  }
  return value;
}

function normalizeRelativeRoute(value) {
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(value)) {
    throw new Error(`Invalid candidate route ${value}. Routes must be lower-case directory paths.`);
  }
  return value;
}

function normalizeFullRoute(value, publicBase) {
  if (typeof value !== "string" || !value.startsWith(publicBase) || !value.endsWith("/") || value.includes("#") || value.includes("?")) {
    throw new Error(`Invalid public route ${value}. It must be a directory path below ${publicBase}.`);
  }
  const relative = `/${value.slice(publicBase.length)}`;
  normalizeRelativeRoute(relative);
  return value;
}

function fullRoute(publicBase, relativeRoute) {
  return relativeRoute === "/" ? publicBase : `${publicBase}${relativeRoute.slice(1)}`;
}

function relativeRoute(publicBase, fullPath) {
  return fullPath === publicBase ? "/" : `/${fullPath.slice(publicBase.length)}`;
}

function routeDocument(root, route) {
  return path.join(root, ...route.split("/").filter(Boolean), "index.html");
}

function htmlIds(html) {
  return [...html.matchAll(/\sid=(["'])(.*?)\1/g)].map((match) => match[2]);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  return hashIndex < 0
    ? { Path: target, Fragment: "" }
    : { Path: target.slice(0, hashIndex), Fragment: target.slice(hashIndex + 1) };
}

function validateFragmentId(value, description) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(value)) {
    throw new Error(`Invalid ${description} fragment ID ${value}.`);
  }
  return value;
}

function validateReasonedRule(rule, description) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.Added || "")) throw new Error(`${description} needs an Added date in YYYY-MM-DD form.`);
  if (typeof rule.Reason !== "string" || !rule.Reason.trim()) throw new Error(`${description} needs a nonempty Reason.`);
}

function contractHash(contract) {
  return crypto.createHash("sha256").update(`${JSON.stringify(contract, null, 2)}\n`).digest("hex");
}

function directoryHash(root) {
  const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, "/"))
    .sort();
  const hash = crypto.createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, ...relative.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateLocalReferences(root, publicBase) {
  const htmlFiles = fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));
  for (const htmlPath of htmlFiles) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const ids = htmlIds(html);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) throw new Error(`${path.relative(root, htmlPath)} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}.`);
    if (/<script\b[^>]*\bsrc="https?:\/\//i.test(html)
        || /<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="https?:\/\//i.test(html)) {
      throw new Error(`${path.relative(root, htmlPath)} loads a remote script or stylesheet.`);
    }
    const references = [
      ...html.matchAll(/<(?:a|link)\b[^>]*\bhref=(["'])(.*?)\1/g),
      ...html.matchAll(/<(?:script|img)\b[^>]*\bsrc=(["'])(.*?)\1/g),
    ].map((match) => match[2]);
    for (const reference of references) {
      if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference)) continue;
      const [rawPath, rawFragment = ""] = reference.split("#", 2);
      const withoutQuery = rawPath.split("?", 1)[0];
      if (withoutQuery.startsWith("/") && !withoutQuery.startsWith(publicBase)) continue;
      const decodedPath = decodeURIComponent(withoutQuery);
      let target;
      if (!decodedPath) target = htmlPath;
      else if (decodedPath.startsWith(publicBase)) target = routeDocument(root, relativeRoute(publicBase, decodedPath));
      else target = path.resolve(path.dirname(htmlPath), decodedPath);
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
      if (!fs.existsSync(target)) throw new Error(`${path.relative(root, htmlPath)} links to missing local target ${reference}.`);
      if (rawFragment && target.endsWith(".html")) {
        const fragment = decodeURIComponent(rawFragment);
        if (!htmlIds(fs.readFileSync(target, "utf8")).includes(fragment)) {
          throw new Error(`${path.relative(root, htmlPath)} links to missing fragment ${reference}.`);
        }
      }
    }
  }
}

function canonicalizeEmbeddedPdf(root, embeddedPdf, canonicalPdfHref) {
  if (embeddedPdf === undefined) return;
  if (typeof embeddedPdf !== "string" || !embeddedPdf || path.isAbsolute(embeddedPdf)) {
    throw new Error("EmbeddedPdf must be a nonempty relative path inside the candidate bundle.");
  }
  const normalized = embeddedPdf.replaceAll("\\", "/");
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid EmbeddedPdf path ${embeddedPdf}.`);
  }
  const embeddedPath = path.resolve(root, ...normalized.split("/"));
  if (!embeddedPath.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(embeddedPath) || !fs.statSync(embeddedPath).isFile()) {
    throw new Error(`The configured embedded PDF does not exist inside the candidate bundle: ${embeddedPdf}.`);
  }

  const htmlFiles = fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));
  let replacements = 0;
  for (const htmlPath of htmlFiles) {
    const relativePdfHref = path.relative(path.dirname(htmlPath), embeddedPath).replaceAll(path.sep, "/");
    let html = fs.readFileSync(htmlPath, "utf8");
    for (const quote of ['"', "'"]) {
      const source = `href=${quote}${relativePdfHref}${quote}`;
      const replacement = `href=${quote}${canonicalPdfHref}${quote}`;
      const occurrences = html.split(source).length - 1;
      if (occurrences) {
        html = html.replaceAll(source, replacement);
        replacements += occurrences;
      }
    }
    fs.writeFileSync(htmlPath, html, "utf8");
  }
  if (!replacements) throw new Error(`No HTML page links to the configured embedded PDF ${embeddedPdf}.`);
  fs.rmSync(embeddedPath, { force: true });
}

function validateCandidate(sourceRoot, contract, workId, publicBase) {
  if (contract.SchemaVersion !== 1 || contract.WorkId !== workId) throw new Error("The candidate public contract does not match the configured work.");
  const canonicalPath = new URL(contract.CanonicalBase).pathname;
  if (canonicalPath !== publicBase) throw new Error(`The candidate canonical base ${canonicalPath} does not match ${publicBase}.`);
  const routes = new Map();
  for (const route of contract.Routes || []) {
    normalizeRelativeRoute(route.Path);
    if (routes.has(route.Path)) throw new Error(`The candidate contract repeats route ${route.Path}.`);
    const documentPath = routeDocument(sourceRoot, route.Path);
    if (!fs.existsSync(documentPath)) throw new Error(`The candidate contract points to missing route ${route.Path}.`);
    const ids = new Set(htmlIds(fs.readFileSync(documentPath, "utf8")));
    const fragments = new Map();
    for (const fragment of route.Fragments || []) {
      validateFragmentId(fragment.Id, route.Path);
      if (fragments.has(fragment.Id)) throw new Error(`The candidate contract repeats ${route.Path}#${fragment.Id}.`);
      if (!ids.has(fragment.Id)) throw new Error(`The candidate contract points to missing ${route.Path}#${fragment.Id}.`);
      fragments.set(fragment.Id, fragment);
    }
    routes.set(route.Path, { ...route, FragmentsById: fragments });
  }
  if (!routes.has("/")) throw new Error("The candidate contract has no work-index route.");
  for (const route of routes.values()) {
    if (route.Kind === "alias") {
      normalizeRelativeRoute(route.Target);
      if (!routes.has(route.Target)) throw new Error(`Candidate alias ${route.Path} targets missing route ${route.Target}.`);
    }
  }
  validateLocalReferences(sourceRoot, publicBase);
  return routes;
}

function loadRetirements(filePath, workId, publicBase) {
  const data = readJson(filePath, "retirement registry");
  if (data.SchemaVersion !== 1 || data.WorkId !== workId) throw new Error("The retirement registry does not match the configured work.");
  const routes = new Map();
  for (const rule of data.Routes || []) {
    normalizeFullRoute(rule.Path, publicBase);
    validateReasonedRule(rule, `Route retirement ${rule.Path}`);
    if (!new Set(["redirect", "tombstone"]).has(rule.Action)) throw new Error(`Route retirement ${rule.Path} has invalid action ${rule.Action}.`);
    if (rule.Action === "redirect") {
      if (!rule.Target) throw new Error(`Route redirect ${rule.Path} has no Target.`);
      normalizeFullRoute(splitTarget(rule.Target).Path, publicBase);
    } else if (rule.Target) throw new Error(`Route tombstone ${rule.Path} must not have a Target.`);
    if (routes.has(rule.Path)) throw new Error(`The retirement registry repeats route ${rule.Path}.`);
    routes.set(rule.Path, rule);
  }
  const fragments = new Map();
  for (const rule of data.Fragments || []) {
    normalizeFullRoute(rule.Path, publicBase);
    validateFragmentId(rule.Fragment, rule.Path);
    validateReasonedRule(rule, `Fragment retirement ${rule.Path}#${rule.Fragment}`);
    if (!new Set(["alias", "tombstone"]).has(rule.Action)) throw new Error(`Fragment retirement ${rule.Path}#${rule.Fragment} has invalid action ${rule.Action}.`);
    if (rule.Action === "alias") {
      const target = splitTarget(rule.Target || "");
      normalizeFullRoute(target.Path, publicBase);
      validateFragmentId(target.Fragment, "target");
    } else if (rule.Target) throw new Error(`Fragment tombstone ${rule.Path}#${rule.Fragment} must not have a Target.`);
    const key = `${rule.Path}#${rule.Fragment}`;
    if (fragments.has(key)) throw new Error(`The retirement registry repeats ${key}.`);
    fragments.set(key, rule);
  }
  return { Routes: routes, Fragments: fragments };
}

function candidateLedgerRoute(route, publicBase) {
  return {
    Path: fullRoute(publicBase, route.Path),
    Kind: route.Kind,
    Status: route.Kind === "alias" ? "redirect" : "live",
    ...(route.Kind === "alias" ? { Target: fullRoute(publicBase, route.Target) } : {}),
    Fragments: [...route.FragmentsById.values()].map((fragment) => ({
      Id: fragment.Id,
      Kind: fragment.Kind,
      Status: "live",
    })),
  };
}

function targetFragmentExists(target, currentRoutes, publicBase) {
  const parsed = splitTarget(target);
  const route = currentRoutes.get(relativeRoute(publicBase, parsed.Path));
  return Boolean(route && parsed.Fragment && route.FragmentsById.has(parsed.Fragment));
}

function buildLedger(contract, currentRoutes, previous, retirements, publicBase) {
  if (previous && (previous.SchemaVersion !== 1 || previous.WorkId !== contract.WorkId || previous.PublicBase !== publicBase)) {
    throw new Error("The existing public-path lockfile does not match this work and public base.");
  }
  const previousRoutes = new Map((previous?.Routes || []).map((route) => [route.Path, route]));
  const nextRoutes = new Map();
  for (const route of currentRoutes.values()) {
    const next = candidateLedgerRoute(route, publicBase);
    const prior = previousRoutes.get(next.Path);
    if (prior) {
      if (prior.Kind !== next.Kind || prior.Status !== next.Status || prior.Target !== next.Target) {
        throw new Error(`Candidate route ${next.Path} would repurpose a previously published address.`);
      }
      const currentFragments = new Set(next.Fragments.map((fragment) => fragment.Id));
      for (const priorFragment of prior.Fragments || []) {
        if (currentFragments.has(priorFragment.Id)) continue;
        const key = `${next.Path}#${priorFragment.Id}`;
        const rule = retirements.Fragments.get(key);
        if (!rule) throw new Error(`Locked fragment ${key} disappeared without an explicit alias or tombstone.`);
        next.Fragments.push({
          Id: priorFragment.Id,
          Kind: priorFragment.Kind,
          Status: rule.Action === "alias" ? "redirect" : "tombstone",
          ...(rule.Target ? { Target: rule.Target } : {}),
          Added: rule.Added,
          Reason: rule.Reason,
        });
      }
    }
    nextRoutes.set(next.Path, next);
  }

  for (const [fullPath, prior] of previousRoutes) {
    if (nextRoutes.has(fullPath)) continue;
    const rule = retirements.Routes.get(fullPath);
    if (!rule) throw new Error(`Locked route ${fullPath} disappeared without an explicit redirect or tombstone.`);
    const next = {
      Path: fullPath,
      Kind: prior.Kind,
      Status: rule.Action,
      ...(rule.Target ? { Target: rule.Target } : {}),
      Added: rule.Added,
      Reason: rule.Reason,
      Fragments: [],
    };
    for (const priorFragment of prior.Fragments || []) {
      const specific = retirements.Fragments.get(`${fullPath}#${priorFragment.Id}`);
      if (specific) {
        next.Fragments.push({
          Id: priorFragment.Id,
          Kind: priorFragment.Kind,
          Status: specific.Action === "alias" ? "redirect" : "tombstone",
          ...(specific.Target ? { Target: specific.Target } : {}),
          Added: specific.Added,
          Reason: specific.Reason,
        });
      } else if (rule.Action === "tombstone") {
        next.Fragments.push({ Id: priorFragment.Id, Kind: priorFragment.Kind, Status: "tombstone", Added: rule.Added, Reason: rule.Reason });
      } else {
        const target = splitTarget(rule.Target);
        const inferredTarget = target.Fragment ? rule.Target : `${target.Path}#${priorFragment.Id}`;
        if (!target.Fragment && !targetFragmentExists(inferredTarget, currentRoutes, publicBase)) {
          throw new Error(`Route redirect ${fullPath} cannot preserve fragment #${priorFragment.Id}. Add a fragment alias or tombstone.`);
        }
        next.Fragments.push({ Id: priorFragment.Id, Kind: priorFragment.Kind, Status: "redirect", Target: inferredTarget, Added: rule.Added, Reason: rule.Reason });
      }
    }
    nextRoutes.set(fullPath, next);
  }

  for (const [fullPath, rule] of retirements.Routes) {
    if (currentRoutes.has(relativeRoute(publicBase, fullPath))) throw new Error(`Route retirement ${fullPath} collides with a current candidate route.`);
    if (!nextRoutes.has(fullPath)) {
      nextRoutes.set(fullPath, {
        Path: fullPath,
        Kind: "retired-route",
        Status: rule.Action,
        ...(rule.Target ? { Target: rule.Target } : {}),
        Added: rule.Added,
        Reason: rule.Reason,
        Fragments: [],
      });
    }
  }

  for (const [key, rule] of retirements.Fragments) {
    const route = nextRoutes.get(rule.Path);
    if (!route) throw new Error(`Fragment retirement ${key} has no current or retired route.`);
    if (route.Fragments.some((fragment) => fragment.Id === rule.Fragment)) continue;
    const current = currentRoutes.get(relativeRoute(publicBase, rule.Path));
    if (current?.FragmentsById.has(rule.Fragment)) throw new Error(`Fragment retirement ${key} collides with a current candidate fragment.`);
    route.Fragments.push({
      Id: rule.Fragment,
      Kind: "retired-fragment",
      Status: rule.Action === "alias" ? "redirect" : "tombstone",
      ...(rule.Target ? { Target: rule.Target } : {}),
      Added: rule.Added,
      Reason: rule.Reason,
    });
  }

  for (const route of nextRoutes.values()) {
    if (route.Status === "redirect") {
      const targetPath = splitTarget(route.Target).Path;
      if (!currentRoutes.has(relativeRoute(publicBase, targetPath))) throw new Error(`Redirect ${route.Path} targets non-current route ${targetPath}.`);
    }
    for (const fragment of route.Fragments) {
      if (fragment.Status === "redirect" && !targetFragmentExists(fragment.Target, currentRoutes, publicBase)) {
        throw new Error(`Fragment redirect ${route.Path}#${fragment.Id} targets a missing current fragment.`);
      }
    }
    route.Fragments.sort((left, right) => left.Id.localeCompare(right.Id));
  }

  return {
    SchemaVersion: 1,
    WorkId: contract.WorkId,
    PublicBase: publicBase,
    CandidateContractSha256: contractHash(contract),
    Routes: [...nextRoutes.values()].sort((left, right) => left.Path.localeCompare(right.Path)),
  };
}

function relativeHref(fromRoute, target) {
  const parsed = splitTarget(target);
  let href = path.posix.relative(fromRoute, parsed.Path);
  if (!href) href = "./";
  else if (parsed.Path.endsWith("/")) href += "/";
  return `${href}${parsed.Fragment ? `#${parsed.Fragment}` : ""}`;
}

function retirementStyles() {
  return `<style>
    .publication-fragment-notice { margin: 2rem 0; padding: 1rem; border: 1px solid #b6aa91; background: #faf7ef; }
    .publication-fragment-notice:not(:target) { display: none; }
  </style>`;
}

function renderRouteRetirement(route, contract, publicBase) {
  const title = route.Status === "redirect" ? "Page moved" : "Page retired";
  const canonical = route.Status === "redirect"
    ? new URL(splitTarget(route.Target).Path.slice(publicBase.length), contract.CanonicalBase).href
    : new URL(route.Path.slice(publicBase.length), contract.CanonicalBase).href;
  const fragmentNotices = route.Fragments.map((fragment) => {
    const link = fragment.Status === "redirect"
      ? ` It now appears at <a href="${escapeHtml(relativeHref(route.Path, fragment.Target))}">this address</a>.`
      : "";
    return `<aside class="publication-fragment-notice" id="${escapeHtml(fragment.Id)}"><strong>Retired fragment.</strong> ${escapeHtml(fragment.Reason || route.Reason)}${link}</aside>`;
  }).join("\n");
  const redirectScript = route.Status === "redirect" ? `<script>
    (() => {
      const fragmentTargets = ${JSON.stringify(Object.fromEntries(route.Fragments.filter((fragment) => fragment.Status === "redirect").map((fragment) => [fragment.Id, relativeHref(route.Path, fragment.Target)])))};
      const tombstones = new Set(${JSON.stringify(route.Fragments.filter((fragment) => fragment.Status === "tombstone").map((fragment) => fragment.Id))});
      const fragment = decodeURIComponent(location.hash.slice(1));
      if (fragment && tombstones.has(fragment)) return;
      location.replace(fragmentTargets[fragment] || ${JSON.stringify(relativeHref(route.Path, route.Target))});
    })();
  </script>` : "";
  const mainMessage = route.Status === "redirect"
    ? `This page has moved to <a href="${escapeHtml(relativeHref(route.Path, route.Target))}">its current address</a>.`
    : escapeHtml(route.Reason);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <title>${title}</title>
  ${retirementStyles()}
  ${redirectScript}
</head>
<body>
  <main><h1>${title}</h1><p>${mainMessage}</p>${fragmentNotices}</main>
</body>
</html>
`;
}

function materializeRetirements(stageRoot, ledger, currentRoutes, contract, publicBase) {
  for (const route of ledger.Routes) {
    const relative = relativeRoute(publicBase, route.Path);
    const documentPath = routeDocument(stageRoot, relative);
    if (!currentRoutes.has(relative)) {
      fs.mkdirSync(path.dirname(documentPath), { recursive: true });
      fs.writeFileSync(documentPath, renderRouteRetirement(route, contract, publicBase), "utf8");
      continue;
    }
    const retiredFragments = route.Fragments.filter((fragment) => fragment.Status !== "live");
    if (!retiredFragments.length) continue;
    let html = fs.readFileSync(documentPath, "utf8");
    const fragmentTargets = Object.fromEntries(retiredFragments
      .filter((fragment) => fragment.Status === "redirect")
      .map((fragment) => [fragment.Id, relativeHref(route.Path, fragment.Target)]));
    const script = `<script>
    (() => {
      const targets = ${JSON.stringify(fragmentTargets)};
      const fragment = decodeURIComponent(location.hash.slice(1));
      if (targets[fragment]) location.replace(targets[fragment]);
    })();
  </script>`;
    const notices = retiredFragments.map((fragment) => {
      const link = fragment.Status === "redirect"
        ? ` It now appears at <a href="${escapeHtml(relativeHref(route.Path, fragment.Target))}">this address</a>.`
        : "";
      return `<aside class="publication-fragment-notice" id="${escapeHtml(fragment.Id)}"><strong>Retired fragment.</strong> ${escapeHtml(fragment.Reason)}${link}</aside>`;
    }).join("\n");
    html = html.replace("</head>", `${retirementStyles()}\n  ${script}\n</head>`);
    html = html.replace("</main>", `${notices}\n</main>`);
    fs.writeFileSync(documentPath, html, "utf8");
  }
}

function validateLedgerFiles(stageRoot, ledger, publicBase) {
  for (const route of ledger.Routes) {
    const documentPath = routeDocument(stageRoot, relativeRoute(publicBase, route.Path));
    if (!fs.existsSync(documentPath)) throw new Error(`Locked route ${route.Path} has no staged file.`);
    const ids = new Set(htmlIds(fs.readFileSync(documentPath, "utf8")));
    for (const fragment of route.Fragments) {
      if (!ids.has(fragment.Id)) throw new Error(`Locked fragment ${route.Path}#${fragment.Id} has no staged target.`);
    }
  }
  validateLocalReferences(stageRoot, publicBase);
}

function removeManagedPath(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function publicationMatchesLock(siteRoot, pdfPath, lockPath) {
  if (!fs.existsSync(siteRoot) || !fs.existsSync(pdfPath) || !fs.existsSync(lockPath)) return false;
  if (!fs.statSync(siteRoot).isDirectory() || !fs.statSync(pdfPath).isFile()) return false;
  const lock = readJson(lockPath, "transaction lockfile");
  if (typeof lock.PublishedBundleSha256 !== "string" || directoryHash(siteRoot) !== lock.PublishedBundleSha256) return false;
  if (typeof lock.PublishedPdfSha256 !== "string") return true;
  return fileHash(pdfPath) === lock.PublishedPdfSha256;
}

function restorePublicationPair(publicRoot, publicPdf, siteCandidate, pdfCandidate) {
  if (siteCandidate !== publicRoot) {
    removeManagedPath(publicRoot);
    fs.renameSync(siteCandidate, publicRoot);
  }
  if (pdfCandidate !== publicPdf) {
    removeManagedPath(publicPdf);
    fs.renameSync(pdfCandidate, publicPdf);
  }
}

function recoverInterruptedPublication(websiteRoot, publicRoot, publicPdf, lockPath) {
  const stageRoot = assertManagedPath(websiteRoot, `${publicRoot}.__staging__`, "staged site directory");
  const previousRoot = assertManagedPath(websiteRoot, `${publicRoot}.__previous__`, "previous site directory");
  const stagedPdf = assertManagedPath(websiteRoot, `${publicPdf}.__staging__`, "staged PDF");
  const previousPdf = assertManagedPath(websiteRoot, `${publicPdf}.__previous__`, "previous PDF");
  const stagedLock = assertManagedPath(websiteRoot, `${lockPath}.__staging__`, "staged lockfile");
  const previousLock = assertManagedPath(websiteRoot, `${lockPath}.__previous__`, "previous lockfile");
  const allTemporaryPaths = [stageRoot, stagedPdf, stagedLock, previousRoot, previousPdf, previousLock];

  if (publicationMatchesLock(publicRoot, publicPdf, lockPath)) {
    for (const stale of allTemporaryPaths) removeManagedPath(stale);
    return;
  }

  if (publicationMatchesLock(publicRoot, publicPdf, stagedLock)) {
    removeManagedPath(previousLock);
    if (fs.existsSync(lockPath)) fs.renameSync(lockPath, previousLock);
    fs.renameSync(stagedLock, lockPath);
    for (const stale of [stageRoot, stagedPdf, previousRoot, previousPdf, previousLock]) removeManagedPath(stale);
    console.log("Completed an interrupted notes-publication transaction.");
    return;
  }

  const artifactCandidates = [
    [publicRoot, publicPdf],
    [previousRoot, publicPdf],
    [previousRoot, previousPdf],
    [publicRoot, previousPdf],
  ];
  if (fs.existsSync(lockPath)) {
    const matching = artifactCandidates.find(([site, pdf]) => publicationMatchesLock(site, pdf, lockPath));
    if (matching) {
      restorePublicationPair(publicRoot, publicPdf, ...matching);
      for (const stale of allTemporaryPaths) removeManagedPath(stale);
      console.log("Rolled back an interrupted notes-publication transaction.");
      return;
    }
  }

  if (fs.existsSync(previousLock)) {
    const matching = artifactCandidates.find(([site, pdf]) => publicationMatchesLock(site, pdf, previousLock));
    if (matching) {
      restorePublicationPair(publicRoot, publicPdf, ...matching);
      removeManagedPath(lockPath);
      fs.renameSync(previousLock, lockPath);
      for (const stale of [stageRoot, stagedPdf, stagedLock, previousRoot, previousPdf]) removeManagedPath(stale);
      console.log("Restored the preceding notes publication after an interrupted transaction.");
      return;
    }
  }

  const hasLiveOrBackup = [publicRoot, publicPdf, lockPath, previousRoot, previousPdf, previousLock].some((item) => fs.existsSync(item));
  if (!hasLiveOrBackup) {
    for (const stale of [stageRoot, stagedPdf, stagedLock]) removeManagedPath(stale);
    return;
  }
  throw new Error("The live notes directory, PDF, and public-path lockfile disagree, and no safe transaction recovery is available.");
}

function replacePublication(websiteRoot, stageRoot, publicRoot, stagedPdf, publicPdf, stagedLock, lockPath) {
  const previousRoot = assertManagedPath(websiteRoot, `${publicRoot}.__previous__`, "previous site directory");
  const previousPdf = assertManagedPath(websiteRoot, `${publicPdf}.__previous__`, "previous PDF");
  const previousLock = assertManagedPath(websiteRoot, `${lockPath}.__previous__`, "previous lockfile");
  if (fs.existsSync(previousRoot) || fs.existsSync(previousPdf) || fs.existsSync(previousLock)) {
    throw new Error("Transaction backups remain after recovery; refusing to start another publication swap.");
  }
  let previousSiteExists = false;
  let previousPdfExists = false;
  let previousLockExists = false;
  let stagedSiteInstalled = false;
  let stagedPdfInstalled = false;
  let stagedLockInstalled = false;
  try {
    if (fs.existsSync(publicRoot)) {
      fs.renameSync(publicRoot, previousRoot);
      previousSiteExists = true;
    }
    fs.renameSync(stageRoot, publicRoot);
    stagedSiteInstalled = true;
    if (fs.existsSync(publicPdf)) {
      fs.renameSync(publicPdf, previousPdf);
      previousPdfExists = true;
    }
    fs.renameSync(stagedPdf, publicPdf);
    stagedPdfInstalled = true;
    if (fs.existsSync(lockPath)) {
      fs.renameSync(lockPath, previousLock);
      previousLockExists = true;
    }
    fs.renameSync(stagedLock, lockPath);
    stagedLockInstalled = true;
  } catch (error) {
    if (stagedLockInstalled && fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
    if (previousLockExists && fs.existsSync(previousLock)) fs.renameSync(previousLock, lockPath);
    if (stagedPdfInstalled && fs.existsSync(publicPdf)) fs.rmSync(publicPdf, { force: true });
    if (previousPdfExists && fs.existsSync(previousPdf)) fs.renameSync(previousPdf, publicPdf);
    if (stagedSiteInstalled && fs.existsSync(publicRoot)) fs.rmSync(publicRoot, { recursive: true, force: true });
    if (previousSiteExists && fs.existsSync(previousRoot)) fs.renameSync(previousRoot, publicRoot);
    throw error;
  }
  for (const stale of [previousRoot, previousPdf, previousLock]) {
    try {
      removeManagedPath(stale);
    } catch (error) {
      console.warn(`The publication succeeded, but cleanup of ${stale} failed: ${error.message}`);
    }
  }
}

export function publishWork(configPath, { checkOnly = false, websiteRoot = defaultWebsiteRoot } = {}) {
  const root = path.resolve(websiteRoot);
  const config = readJson(path.resolve(configPath), "publication configuration");
  if (config.SchemaVersion !== 1) throw new Error("The publication configuration has an unsupported schema version.");
  const publicBase = normalizePublicBase(config.PublicBase);
  if (config.WorkId !== publicBase.split("/").filter(Boolean).at(-1)) throw new Error("The work ID must equal the final segment of the public base.");
  if (config.PublicDirectory.replaceAll("\\", "/") !== publicBase.slice(1, -1)) throw new Error("PublicDirectory must be the repository path represented by PublicBase.");
  if (typeof config.SourcePdf !== "string" || typeof config.PublicPdf !== "string") {
    throw new Error("The publication configuration must define SourcePdf and PublicPdf.");
  }
  if (config.PublicPdf.replaceAll("\\", "/") !== `${publicBase.slice(1, -1)}.pdf`) {
    throw new Error("PublicPdf must be the sibling PDF path represented by PublicBase.");
  }

  const sourceRoot = path.resolve(root, config.SourceBundle);
  if (!fs.existsSync(sourceRoot)) throw new Error(`The candidate bundle does not exist: ${sourceRoot}`);
  const sourcePdf = path.resolve(root, config.SourcePdf);
  if (!fs.existsSync(sourcePdf) || !fs.statSync(sourcePdf).isFile()) throw new Error(`The candidate PDF does not exist: ${sourcePdf}`);
  const publicRoot = assertManagedPath(root, path.resolve(root, config.PublicDirectory), "public site directory");
  const publicPdf = assertManagedPath(root, path.resolve(root, config.PublicPdf), "public PDF");
  const publicPdfHref = `/${config.PublicPdf.replaceAll("\\", "/")}`;
  const lockPath = assertManagedPath(root, path.resolve(root, config.Lockfile), "public-path lockfile");
  const retirementPath = assertManagedPath(root, path.resolve(root, config.Retirements), "retirement registry");
  recoverInterruptedPublication(root, publicRoot, publicPdf, lockPath);
  const contractPath = path.join(sourceRoot, "_meta", "public-contract.json");
  const contract = readJson(contractPath, "candidate public contract");
  const currentRoutes = validateCandidate(sourceRoot, contract, config.WorkId, publicBase);
  const retirements = loadRetirements(retirementPath, config.WorkId, publicBase);
  const previous = fs.existsSync(lockPath) ? readJson(lockPath, "public-path lockfile") : null;
  if (!previous && (fs.existsSync(publicRoot) || fs.existsSync(publicPdf))) {
    throw new Error(`Refusing to replace unmanaged public artifacts for ${config.WorkId} without a lockfile.`);
  }
  const ledger = buildLedger(contract, currentRoutes, previous, retirements, publicBase);
  ledger.SourceBundleSha256 = directoryHash(sourceRoot);
  ledger.SourcePdfSha256 = fileHash(sourcePdf);

  const stageRoot = assertManagedPath(root, `${publicRoot}.__staging__`, "staged site directory");
  const stagedPdf = assertManagedPath(root, `${publicPdf}.__staging__`, "staged PDF");
  const stagedLock = assertManagedPath(root, `${lockPath}.__staging__`, "staged lockfile");
  for (const stale of [stageRoot, stagedPdf, stagedLock]) removeManagedPath(stale);
  try {
    fs.mkdirSync(path.dirname(stageRoot), { recursive: true });
    fs.cpSync(sourceRoot, stageRoot, { recursive: true, errorOnExist: true });
    canonicalizeEmbeddedPdf(stageRoot, config.EmbeddedPdf, publicPdfHref);
    fs.mkdirSync(path.dirname(stagedPdf), { recursive: true });
    fs.copyFileSync(sourcePdf, stagedPdf);
    materializeRetirements(stageRoot, ledger, currentRoutes, contract, publicBase);
    validateLedgerFiles(stageRoot, ledger, publicBase);
    ledger.PublishedBundleSha256 = directoryHash(stageRoot);
    ledger.PublishedPdfSha256 = fileHash(stagedPdf);
    writeJson(stagedLock, ledger);
    if (checkOnly) {
      fs.rmSync(stageRoot, { recursive: true, force: true });
      fs.rmSync(stagedPdf, { force: true });
      fs.rmSync(stagedLock, { force: true });
      console.log(`Publication preflight passed for ${config.WorkId}: ${ledger.Routes.length} locked routes.`);
      return ledger;
    }
    replacePublication(root, stageRoot, publicRoot, stagedPdf, publicPdf, stagedLock, lockPath);
    console.log(`Published ${config.WorkId} to ${publicBase} with ${ledger.Routes.length} locked routes.`);
    return ledger;
  } catch (error) {
    for (const stale of [stageRoot, stagedPdf, stagedLock]) removeManagedPath(stale);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configPath, ...options] = process.argv.slice(2);
  if (!configPath) throw new Error("Usage: node publish-notes.mjs CONFIG [--check]");
  const unknown = options.filter((option) => option !== "--check");
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(", ")}.`);
  publishWork(configPath, { checkOnly: options.includes("--check") });
}
