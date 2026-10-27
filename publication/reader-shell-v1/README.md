# Reader shell v1

This directory is the canonical source for the reader interface shared by static
mathematics web editions on this Website.

It owns:

1. The page background, typography, spacing, header, return link, utility dock,
   manuscript control, content card, and contextual navigation styling.
2. HTML renderers for settings, headers, PDF links, navigation ledgers, and
   optional edition footers. Proof choices are configuration supplied by a work.
3. `reader.js`: settings hover/click/keyboard behavior, responsive navigation,
   work-scoped saved preferences, active-position highlighting, and an accessible
   formula-copy menu. It reads each edition's own MathJax macro configuration.
4. The stable `reader-shell-v1` interface consumed at build time by manuscript
   repositories.

It does not own theorem rendering, proof-detail behavior, mathematical macros,
or manuscript-specific navigation contents. Each manuscript generator supplies
those layers and copies this shell into its own static output bundle. Deployed
pages therefore have no runtime dependency on this repository.

The default source location can be overridden with the environment variable
`NOTES_READER_SHELL_ROOT`. This supports checkouts in which the Website and
manuscript repositories are not siblings under the same GitHub directory.

Colours are defined as custom properties on `:root`. Dark mode follows the
operating-system setting and redefines the same properties; a page can force
a scheme with `data-theme="light"` or `data-theme="dark"` on `<html>`.
Manuscript stylesheets should use these properties (or define their own dark
variants) rather than fixed colours.

Breaking changes require a new versioned directory and an explicit migration.

## Using the interface

Build-time generators call `renderReaderSettings` and `renderReaderScripts`.
The latter requires a permanent work ID and loads the common runtime before an
optional manuscript adapter. Use the adapter only for manuscript behavior such
as ordinary proof toggles or nested proof details. Do not duplicate settings or
navigation listeners in it. `legacyPreferences` can name existing navigation,
contents, and rail preference keys; they are read until the reader saves a new
preference. New preferences are isolated under `notes-reader:<work-id>:v1:`.
Proof preferences continue to belong to the manuscript adapter.

Use `installReaderShell(outputRoot, assetDirectory)` or its CLI to copy the
stylesheet and runtime. Each candidate receives `_meta/reader-build.json`,
with the interface revision and asset hashes. Generated script tags carry the
same revision. Validation rejects stale or modified shared assets and pages
that omit the common runtime. Changing shared sources requires rebuilding and
republishing every edition that should receive the change. Readers continue
to receive self-contained static files.

```powershell
node publication/reader-shell-v1/test.mjs
node publication/reader-shell-v1/test-browser.mjs
node publication/reader-shell-v1/test-browser.mjs PATH_TO_GENERATED_EDITION
```

The browser tests use an installed Chromium browser without package dependencies.
Set `NOTES_READER_BROWSER` when it cannot be discovered automatically. They cover
pointer hover and click, touch controls, keyboard activation and focus return,
cross-page preferences and work isolation, denied or malformed storage,
light/dark appearances, diagram inversion, and formula copying. With a generated
edition path, they also verify its work, chapter, section, and entry pages and
exercise its real proof adapter. Both manuscript production builds run these
acceptance tests before their bundle can be published.

## Reading navigation

Chapter, section, and entry headers use SCT-style previous/next chapter and
section controls. Each link names its target number and exposes the full title
in its tooltip and accessible label. Missing neighbors are disabled buttons.
On a chapter opening, “Next section” goes to its first section and “Previous
section” goes to the preceding chapter's last section. Chapters without sections
are skipped by section navigation. Appendix headings keep their own names.
An entry uses its containing chapter and section; result navigation stays separate.

Generators supply the ordered model in `_meta/reading-navigation.json` and call
`applyReadingNavigation`. The renderer does not derive permanent URLs from
titles. The two-by-two layout wraps beneath the title on narrow screens, and
remains available when the reader hides the sidebar.

For a presentation-only refresh of an already validated candidate:

```powershell
node publication/reader-shell-v1/reading-navigation.mjs PATH_TO_GENERATED_EDITION
node publication/reader-shell-v1/test-browser.mjs PATH_TO_GENERATED_EDITION
```

This refresh regenerates the header controls and shared assets from the saved
model, updates the reader receipt, and leaves mathematical content untouched.
Run the manuscript's generated-site validation before normal publication.
