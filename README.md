# bastiaancnossen.com

Source for my personal website. The hand-written pages use plain HTML and one
stylesheet, with no build step and no JavaScript. The mathematical web editions live at [Animarium](https://animarium.org/). See [redirect maintenance](redirects/README.md) for the old addresses and frozen PDFs.

The AI token usage page (`ai-tokens.html`, linked from `ai-use.html`) is a static dated snapshot. Its generated table and public JSON
are produced from the private usage ledger by `knowledge\ai-usage-tooling\publish-web.ps1`.
The headline covers all work classified privately as mathematical. Only projects
explicitly listed in `ai-use-public-projects.json` can appear as named rows; the
public output contains no names or individual totals for other projects.
