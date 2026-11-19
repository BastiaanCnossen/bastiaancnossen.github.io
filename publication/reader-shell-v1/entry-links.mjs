export function renderEntryLinks(tag, tagUrl, entryUrl) {
  return `<details class="entry-links" data-entry-links>
  <summary>Tag ${tag}</summary>
  <div class="entry-link-actions">
    <a data-entry-link href="${tagUrl}">Tag link</a>
    <a data-entry-link href="${entryUrl}">Descriptive link</a>
    <span class="sr-only" role="status" data-entry-link-status></span>
  </div>
</details>`;
}
