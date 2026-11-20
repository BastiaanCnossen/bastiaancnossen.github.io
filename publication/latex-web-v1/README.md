# LaTeX web conversion helpers, version 1

These small build-time helpers support the Efimov K-theory pilot. They are
separate from `reader-shell-v1`, which owns the common reader interface.
The existing Topos and SHT+HA converters remain in their source projects.

1. `source.mjs`: balanced LaTeX groups, AUX reference data, explicit registry
   validation, and MathJax macros from a manuscript's MathJax-safe preamble.
   Prose tables are split into cells before TeX4ht and reconstructed afterwards,
   so the browser lays them out while LaTeX still renders each cell's content.
2. `bibliography.mjs`: the existing standalone SHT+HA bibliography renderer,
   extracted unchanged for reuse. It reads the Biber BBL, including full author
   names, rather than reparsing the shared bibliography independently.
3. `proofs.js` and `style.css`: ordinary proof adapter and TeX4ht content styles.
   They complement the common reader and do not define page navigation.
4. `vendor/mathjax-4.1.3`: pinned MathJax 4.1.3 and New Computer Modern fonts,
   including mathtools and boldsymbol extensions. Extracted byte-for-byte from
   the existing self-contained SHT+HA deployment. Retain the included licenses.

Do not use this directory as a justification to copy an entire work-specific
converter to a new manuscript. Each work needs an explicit source adapter and
registry. Public publication and permanent route validation remain the concern
of `publish-notes.mjs`, not this local pilot.
