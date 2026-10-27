import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, waitFor } from "./browser-harness.mjs";
import { renderReaderHeader, renderReaderSettings, renderReaderScripts, renderContextNavigation, renderContextNavigationToggle } from "./components.mjs";
import { validateReaderShell } from "./install.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const edition = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (edition) validateReaderShell(edition);
const expression = (body) => `(() => { ${body} })()`;
function fixture(work) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/style.css">
    ${renderReaderScripts({ assetPrefix: "/", workId: work, legacyPreferences: { navigation: "legacy-visible", contents: "legacy-contents" } })}
    <script>window.copied = []; Object.defineProperty(navigator, "clipboard", {value: {writeText: async text => window.copied.push(text)}});
    window.MathJax = {config: {tex: {macros: {Sp: "\\\\mathrm{Sp}", pair: ["\\\\langle #1,#2\\\\rangle", 2], Alias: "\\\\Sp"}}}};</script></head>
    <body class="has-context-nav"><aside class="utility-dock">${renderReaderSettings()}</aside>
    ${renderReaderHeader({ workTitle: "Test notes", title: "Reader fixture" })}
    <main class="reader-layout">${renderContextNavigationToggle({ label: "Navigation" })}
    <article class="notes-page"><p id="outside">Mathematical text</p><mjx-container tabindex="0"><mjx-math data-latex="\\pair{\\Alias}{X}">Formula</mjx-math></mjx-container><figure class="diagram"><img alt="Test diagram" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M0 0L20 20' stroke='black'/%3E%3C/svg%3E"></figure></article>
    ${renderContextNavigation({ ledgers: [
      { key: "chapters", title: "Chapters", content: '<a href="#outside">Chapter</a>', collapsed: true },
      { key: "sections", title: "Sections", content: '<a href="#outside">Section</a>' }
    ] })}</main></body></html>`;
}
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.startsWith("/fixture-")) return response.writeHead(200, { "Content-Type": "text/html" }).end(fixture(pathname.includes("second") ? "second-work" : "first-work"));
  const isEdition = pathname.startsWith("/edition/");
  const base = isEdition ? edition : root;
  if (!base) return response.writeHead(404).end();
  let target = path.resolve(base, `.${decodeURIComponent(isEdition ? pathname.slice(8) : pathname)}`);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return response.writeHead(403).end();
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
  if (!fs.existsSync(target)) return response.writeHead(404).end();
  const type = ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" })[path.extname(target)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await launchBrowser(`${origin}/fixture-first`);
  const { evaluate, send, navigate } = browser;
  const run = (body) => evaluate(expression(body));
  const viewport = (width, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
  await viewport(1440);
  await navigate(`${origin}/fixture-first`);
  await run("localStorage.clear()");
  await navigate(`${origin}/fixture-first?fresh`);
  assert.deepEqual(await run(`return [...document.querySelectorAll('[data-contents-toggle]')].map(b => b.getAttribute('aria-expanded'))`), ["false", "true"]);

  // Pinned open, pinned closed while still hovered, outside click, keyboard focus.
  const rect = await run(`const r = document.querySelector('[data-utility-trigger]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
  await waitFor(() => run(`return getComputedStyle(document.querySelector('.utility-panel')).visibility === 'visible'`), "hover opens settings");
  const panelRect = await run(`const r = document.querySelector('.utility-panel').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+30};`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...panelRect });
  assert.equal(await run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded')`), "true");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
  for (let i = 0; i < 2; i++) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...rect });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...rect });
  }
  await waitFor(() => run(`return getComputedStyle(document.querySelector('.utility-panel')).visibility === 'hidden'`), "click closes hovered settings");
  await run(`document.querySelector('[data-utility-trigger]').click(); document.querySelector('#outside').click()`);
  assert.equal(await run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded')`), "false");
  await run(`document.querySelector('[data-utility-trigger]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  assert.equal(await run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded')`), "true");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert.equal(await run(`return document.activeElement.matches('[data-utility-trigger]') && document.activeElement.getAttribute('aria-expanded') === 'false'`), true);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 400 });
  await run(`document.querySelector('#outside').click()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
  await waitFor(() => run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded') === 'true'`), "hover works again after outside dismissal");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 400 });

  // Ledger state and panel visibility survive navigation, but remain work-scoped.
  await run(`document.querySelector('[data-contents-toggle]').click(); const c=document.querySelector('[data-navigation-visibility]'); c.checked=false; c.dispatchEvent(new Event('change'));`);
  await navigate(`${origin}/fixture-first?next`);
  assert.equal(await run(`return document.body.dataset.contextNavigation`), "hidden");
  assert.equal(await run(`return document.querySelector('[data-contents-toggle]').getAttribute('aria-expanded')`), "true");
  await navigate(`${origin}/fixture-second`);
  assert.equal(await run(`return document.body.dataset.contextNavigation`), "visible");
  assert.equal(await run(`return document.querySelector('[data-contents-toggle]').getAttribute('aria-expanded')`), "false");
  await run(`localStorage.clear(); localStorage.setItem('legacy-visible','false'); localStorage.setItem('legacy-contents','{"chapters":true}');`);
  await navigate(`${origin}/fixture-first?legacy`);
  assert.equal(await run(`return document.body.dataset.contextNavigation`), "hidden");
  await run(`localStorage.clear(); localStorage.setItem('notes-reader:first-work:v1:contents','null')`);
  await navigate(`${origin}/fixture-first?malformed`);
  assert.equal(await run(`return document.querySelector('[data-contents-toggle]').getAttribute('aria-expanded')`), "false");

  // Private browsing / denied storage must not disable any controls.
  const storageOverride = await send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(window, 'localStorage', {get() { throw new Error('Storage denied'); }});` });
  await navigate(`${origin}/fixture-first?no-storage`);
  assert.equal(await run(`document.querySelector('[data-contents-toggle]').click(); return document.querySelector('[data-contents-toggle]').getAttribute('aria-expanded')`), "true");
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: storageOverride.identifier });

  // Touch navigation and settings, plus Escape and focus return.
  await viewport(390, true);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await navigate(`${origin}/fixture-first?mobile`);
  assert.equal(await run(`return getComputedStyle(document.querySelector('[data-context-nav]')).display`), "none");
  const touchRect = await run(`const r=document.querySelector('[data-context-nav-toggle]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchRect] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor(() => run(`return document.querySelector('[data-context-nav-toggle]').getAttribute('aria-expanded') === 'true'`), "touch navigation opens");
  await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await run(`return document.activeElement.matches('[data-context-nav-toggle]')`), true);
  await run(`document.querySelector('[data-utility-trigger]').click(); document.querySelector('[data-utility-trigger]').click()`);
  assert.equal(await run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded')`), "false");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await viewport(1440);

  // OS dark mode and explicit overrides include the diagrams, in both editions.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  assert.equal(await run(`return getComputedStyle(document.documentElement).colorScheme`), "dark");
  assert.notEqual(await run(`return getComputedStyle(document.querySelector('.diagram img')).filter`), "none");
  await run(`document.documentElement.dataset.theme='light'`);
  assert.equal(await run(`return getComputedStyle(document.documentElement).colorScheme`), "light");
  assert.equal(await run(`return getComputedStyle(document.querySelector('.diagram img')).filter`), "none");
  await run(`document.documentElement.dataset.theme='dark'`);
  assert.equal(await run(`return getComputedStyle(document.documentElement).colorScheme`), "dark");

  // Formula copy with nested macros, accessible menu movement, and focus return.
  await run(`const f=document.querySelector('mjx-container'); f.focus(); f.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}));`);
  assert.equal(await run(`return document.activeElement.textContent`), "Copy LaTeX");
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));`);
  assert.equal(await run(`return document.activeElement.textContent`), "Copy LaTeX with manuscript macros");
  await run(`document.querySelector('.latex-copy-menu button').click()`);
  await waitFor(() => run(`return window.copied.length === 1`), "formula clipboard");
  assert.equal(await run(`return window.copied[0]`), "\\langle \\mathrm{Sp},X\\rangle");
  await run(`document.querySelector('mjx-container').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:30})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
  assert.equal(await run(`return !document.querySelector('.latex-copy-menu') && document.activeElement.matches('mjx-container')`), true);

  if (edition) {
    // Exercise the actual generated chrome and actual proof adapter, not a mock.
    const contract = JSON.parse(fs.readFileSync(path.join(edition, "_meta/public-contract.json"), "utf8"));
    const entries = contract.Routes.filter((route) => route.Kind === "entry");
    const proofEntry = entries.find((route) => /class=["'][^"']*\bproof(?:-shell)?\b/.test(fs.readFileSync(path.join(edition, route.Path, "index.html"), "utf8")));
    assert(proofEntry, "The edition has no proof page for its reader acceptance test.");
    const pages = ["/", contract.Routes.find((route) => route.Kind === "chapter").Path, contract.Routes.find((route) => route.Kind === "section").Path, proofEntry.Path];
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await run("localStorage.clear()");
    for (const page of pages) {
      await navigate(`${origin}/edition${page}`);
      assert.equal(await run(`return document.querySelectorAll('script[data-notes-reader]').length`), 1);
      assert.equal(await run(`return window.NotesReader.workId`), contract.WorkId);
      await run(`document.querySelector('[data-utility-trigger]').click(); document.querySelector('[data-utility-trigger]').click()`);
      assert.equal(await run(`return document.querySelector('[data-utility-trigger]').getAttribute('aria-expanded')`), "false");
      assert.equal(await run(`const b=document.querySelector('[data-contents-toggle]'); if (!b) return true; const before=b.getAttribute('aria-expanded'); b.click(); const changed=b.getAttribute('aria-expanded') !== before; b.click(); return changed;`), true);
      assert.equal(await run(`const c=document.querySelector('[data-navigation-visibility]'); c.checked=false; c.dispatchEvent(new Event('change')); const hidden=getComputedStyle(document.querySelector('[data-context-nav]')).display === 'none'; c.checked=true; c.dispatchEvent(new Event('change')); return hidden;`), true);
    }
    const readingModelFile = path.join(edition, "_meta/reading-navigation.json");
    if (fs.existsSync(readingModelFile)) {
      const model = JSON.parse(fs.readFileSync(readingModelFile, "utf8"));
      const chapters = model.chapters;
      const sections = chapters.flatMap((chapter) => chapter.sections);
      await navigate(`${origin}/edition/${chapters[0].page}`);
      assert.equal(await run(`return document.querySelector('.site-header [data-step="prev-chapter"]').disabled`), true);
      assert.equal(await run(`return document.querySelectorAll('.site-header .page-turns [data-step]').length`), 4);
      assert.equal(await run(`return document.querySelector('[data-context-nav] .context-step-controls') === null`), true);
      await navigate(`${origin}/edition/${chapters.at(-1).page}`);
      assert.equal(await run(`return document.querySelector('[data-step="next-chapter"]').disabled`), true);
      await navigate(`${origin}/edition/${sections[0].page}`);
      assert.equal(await run(`return document.querySelector('[data-step="prev-section"]').disabled`), true);
      const firstWithSections = chapters.find((chapter) => chapter.sections.length > 0);
      const boundary = firstWithSections.sections.at(-1);
      const following = sections[sections.findIndex((section) => section.page === boundary.page) + 1];
      await navigate(`${origin}/edition/${boundary.page}`);
      assert.equal(await run(`return new URL(document.querySelector('[data-step="next-section"]').href).pathname`), `/edition/${following.page}`);
      await run(`document.querySelector('[data-step="next-section"]').click()`);
      await waitFor(() => run(`return location.pathname === ${JSON.stringify(`/edition/${following.page}`)} && !!window.NotesReader`), "section navigation across a chapter boundary");
      await viewport(390, true);
      assert.equal(await run(`const nav=document.querySelector('.page-turns'); return nav.getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth;`), true);
      assert.equal(await run(`return getComputedStyle(document.querySelector('.page-turns')).gridTemplateColumns.split(' ').length`), 2);
      await navigate(`${origin}/edition/${chapters[Math.min(1, chapters.length - 1)].page}`);
      assert.equal(await run(`return document.documentElement.scrollWidth <= innerWidth;`), true, "Chapter introductions must fit the phone viewport.");
      await viewport(1440);
      await navigate(`${origin}/edition/${sections.at(-1).page}`);
      assert.equal(await run(`return document.querySelector('[data-step="next-section"]').disabled`), true);
      await navigate(`${origin}/edition${proofEntry.Path}`);
    }
    const collapsed = await run(`const b=document.querySelector('[data-proof-mode="collapsed"], [data-detail-level="-1"]'); b.click(); const p=document.querySelector('.proof-shell, .proof'); return p.matches('details') ? !p.open : p.dataset.collapsed === 'true';`);
    assert.equal(collapsed, true);
    const independentlyOpened = await run(`const p=document.querySelector('.proof-shell, .proof'); p.querySelector('summary, [data-proof-toggle]').click(); return p.matches('details') ? p.open : p.dataset.collapsed === 'false';`);
    assert.equal(independentlyOpened, true);
    await navigate(`${origin}/edition${proofEntry.Path}?persisted`);
    assert.equal(await run(`const p=document.querySelector('.proof-shell, .proof'); return p.matches('details') ? !p.open : p.dataset.collapsed === 'true'`), true);
    assert.equal(await run(`document.querySelector('[data-proof-mode="displayed"], [data-detail-level="1"]').click(); const p=document.querySelector('.proof-shell, .proof'); return p.matches('details') ? p.open : p.dataset.collapsed === 'false';`), true);
    await evaluate("window.MathJax.startup.promise");
    assert.equal(await run(`window.copied=[]; Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)}}); const f=document.querySelector('mjx-container'); f.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:30})); return !!document.querySelector('.latex-copy-menu');`), true);
    await run(`document.querySelector('.latex-copy-menu button').click()`);
    await waitFor(() => run(`return window.copied.length === 1 && window.copied[0].length > 0`), "copying a real rendered manuscript formula");
    console.log(`Validated shared reader on generated ${contract.WorkId} work, chapter, section, and entry pages, including its proof adapter.`);
  }
  assert.deepEqual(browser.errors, [], "The reader produced browser JavaScript errors.");
  console.log("Shared reader browser tests passed: pointer, touch, keyboard, persistence, denied storage, light/dark modes, and formula copying.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
