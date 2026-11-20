# Animarium redirects

The frozen ledgers and tag registry come from deployed Website commit
`03adda72`. The old site keeps its public PDFs as frozen copies. Animarium
publishes the current PDFs and web editions.

From the Website repository, use these commands against an installed local
Animarium checkout.

```powershell
node redirects/test-animarium-redirects.mjs
node redirects/generate-animarium-redirects.mjs ../Animarium
node redirects/generate-animarium-redirects.mjs ../Animarium --check
```

The planner verifies every old route, promised fragment, and tag before writing
pages. JavaScript carries the incoming query and fragment, with an explicit
alias taking precedence. The plain link and meta refresh provide the default
destination for browsers without JavaScript. Retired pages keep their notices.

Deploy and verify Animarium over HTTPS before publishing the old-site redirects.
