# bastiaancnossen.com

Source for my personal website. The hand-written pages use plain HTML and one
stylesheet, with no build step and no JavaScript. Generated mathematical notes
are self-contained static bundles published by the maintenance scripts in
`publication/`. See `publication/README.md` for the transactional publication
workflow, permanent-address policy, and instructions for adding another work.

The AI-use page is a static dated snapshot. Its generated table and public JSON
are produced from the private usage ledger by `knowledge\ai-usage-tooling\publish-web.ps1`.
The headline covers all work classified privately as mathematical. Only projects
explicitly listed in `ai-use-public-projects.json` can appear as named rows; the
public output contains no names or individual totals for other projects.
