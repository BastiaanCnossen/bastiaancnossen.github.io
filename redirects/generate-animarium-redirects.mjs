import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://animarium.org';
const routePattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/;
const tagPattern = /^[0-9A-HJKMNP-TV-Z]{4}$/;
const fragmentPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;
const directory = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function redirectDestination(fallback, overrides, query, hash) {
  let id = hash.slice(1);
  try { id = decodeURIComponent(id); } catch { /* Keep the original fragment on malformed URLs. */ }
  const target = new URL(Object.hasOwn(overrides, id) ? overrides[id] : fallback);
  target.search = query;
  if (!target.hash) target.hash = hash;
  return target.href;
}

export function renderRedirect(destination, overrides = {}) {
  const href = escapeHtml(destination);
  const scriptArguments = [destination, overrides].map(value => JSON.stringify(value).replaceAll('<', '\\u003c'));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${href}">
  <title>Moved to Animarium</title>
  <script>location.replace((${redirectDestination.toString()})(${scriptArguments.join(', ')}, location.search, location.hash));</script>
  <noscript><meta http-equiv="refresh" content="0; url=${href}"></noscript>
</head>
<body><main><h1>Moved to Animarium</h1><p><a href="${href}">Open the current address</a></p></main></body>
</html>
`;
}

export function renderTombstone(route) {
  const notices = (route.Fragments || []).map(fragment => {
    const reason = escapeHtml(fragment.Reason || route.Reason);
    return `<aside id="${escapeHtml(fragment.Id)}">${reason}</aside>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <title>Page retired</title>
  <style>aside:not(:target) { display: none; }</style>
</head>
<body><main><h1>Page retired</h1><p>${escapeHtml(route.Reason)}</p>
  ${notices}
  <p><a href="${origin}/">Visit the Animarium library</a></p>
</main></body>
</html>
`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function documentFor(root, route) {
  const isTag = route.startsWith('/tag/') && route.endsWith('/') && tagPattern.test(route.slice(5, -1));
  if (!isTag && !routePattern.test(route)) throw new Error(`Invalid route ${route}`);
  return path.join(root, ...route.split('/').filter(Boolean), 'index.html');
}

export function planRedirects(legacy, animarium) {
  const pages = new Map();
  const read = relative => readJson(path.join(legacy, relative));
  const add = (route, html) => {
    if (pages.has(route)) throw new Error(`Duplicate old route ${route}`);
    pages.set(route, html);
  };
  let fragmentCount = 0;
  for (const filename of fs.readdirSync(path.join(legacy, 'locks')).filter(name => name.endsWith('.json')).sort()) {
    const oldLock = read(`locks/${filename}`);
    const newLock = readJson(path.join(animarium, 'publication', 'locks', filename));
    const work = oldLock.WorkId;
    const translate = target => {
      if (typeof target !== 'string' || !target.startsWith(oldLock.PublicBase)) {
        throw new Error(`Unexpected ${work} address: ${target}`);
      }
      return newLock.PublicBase + target.slice(oldLock.PublicBase.length);
    };
    if (oldLock.PublicBase !== `/notes/${work}/` || newLock.PublicBase !== `/${work}/` || newLock.WorkId !== work) {
      throw new Error(`Unexpected lockfile bases for ${work}`);
    }
    const newRoutes = new Map(newLock.Routes.map(route => [route.Path, route]));
    const idsByRoute = new Map();
    function verify(target) {
      const [route, id] = translate(target).split('#');
      const record = newRoutes.get(route);
      if (!record) throw new Error(`No Animarium route for ${target}`);
      if (!idsByRoute.has(route)) {
        const html = fs.readFileSync(documentFor(animarium, route), 'utf8');
        idsByRoute.set(route, new Set([...html.matchAll(/\sid=(["'])(.*?)\1/g)].map(match => match[2])));
      }
      if (id && (!fragmentPattern.test(id) || !idsByRoute.get(route).has(id))) {
        throw new Error(`No Animarium fragment for ${target}`);
      }
      return origin + route + (id ? '#' + id : '');
    }
    for (const route of oldLock.Routes) {
      const counterpart = verify(route.Path);
      const current = newRoutes.get(translate(route.Path));
      if (current.Status !== route.Status || current.Target !== (route.Target && translate(route.Target))) {
        throw new Error(`Animarium did not reproduce the address history for ${route.Path}`);
      }
      const currentFragments = new Map(current.Fragments.map(fragment => [fragment.Id, fragment]));
      const overrides = Object.create(null);
      for (const fragment of route.Fragments) {
        fragmentCount += 1;
        const address = route.Path + '#' + fragment.Id;
        const fragmentDestination = verify(address);
        const migrated = currentFragments.get(fragment.Id);
        if (migrated?.Status !== fragment.Status || migrated.Target !== (fragment.Target && translate(fragment.Target))) {
          throw new Error(`Animarium did not reproduce the fragment history for ${address}`);
        }
        if (fragment.Status === 'redirect') overrides[fragment.Id] = verify(fragment.Target);
        if (fragment.Status === 'tombstone') overrides[fragment.Id] = fragmentDestination;
      }
      if (route.Status === 'tombstone') add(route.Path, renderTombstone(route));
      else add(route.Path, renderRedirect(route.Target ? verify(route.Target) : counterpart, overrides));
    }
  }
  const routeCount = pages.size;
  const newTags = new Map(readJson(path.join(animarium, 'publication', 'entry-tags.json')).Tags);
  const oldTags = read('entry-tags.json').Tags;
  for (const [tag, previous] of oldTags) {
    if (!tagPattern.test(tag)) throw new Error(`Invalid old tag ${tag}`);
    const expected = typeof previous === 'string' ? previous.replace(/^\/notes\//, '/') : previous;
    if (JSON.stringify(newTags.get(tag)) !== JSON.stringify(expected)) throw new Error(`Animarium changed tag ${tag}`);
    const route = `/tag/${tag}/`;
    if (!fs.statSync(documentFor(animarium, route)).isFile()) throw new Error(`Missing Animarium tag ${tag}`);
    add(route, renderRedirect(origin + route));
  }
  return { pages, routeCount, fragmentCount, tagCount: oldTags.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [candidate, ...options] = process.argv.slice(2);
  if (!candidate || options.some(option => option !== '--check')) {
    throw new Error('Usage: node redirects/generate-animarium-redirects.mjs ANIMARIUM_CHECKOUT [--check]');
  }
  const plan = planRedirects(directory, path.resolve(candidate));
  for (const [route, html] of plan.pages) {
    const document = documentFor(path.dirname(directory), route);
    if (options.includes('--check')) {
      if (fs.readFileSync(document, 'utf8').replaceAll('\r\n', '\n') !== html) {
        throw new Error(`Stale old-site redirect at ${route}`);
      }
    } else {
      fs.mkdirSync(path.dirname(document), { recursive: true });
      fs.writeFileSync(document, html);
    }
  }
  console.log(`${plan.routeCount} work routes, ${plan.fragmentCount} promised fragments, and ${plan.tagCount} old tag URLs verified against Animarium.`);
}
