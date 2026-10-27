# Reader shell v1

This directory is the canonical source for the visual shell shared by static
mathematics web editions on this Website.

It owns:

1. The page background, typography, spacing, header, return link, utility dock,
   manuscript control, content card, and contextual navigation styling.
2. Small HTML renderers for those shared components.
3. The stable `reader-shell-v1` interface consumed at build time by manuscript
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
