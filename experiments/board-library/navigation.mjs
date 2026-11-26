// App-owned navigation only. Compatibility is declared by the pinned book catalogue.
export function compatibleBook(identity, books) {
  return books.find(book => book.manufacturer === identity?.manufacturer &&
    book.model === identity?.model && book.compatibility?.startsWith('exact_'));
}

export function libraryDestination(base, origin, book) {
  const url = new URL(base, origin);
  url.searchParams.delete('book');
  url.searchParams.delete('open');
  url.searchParams.delete('entry');
  if (book) {
    url.searchParams.set('book', book.id);
    // Explicit cover entry overrides the engine's automatic book opening.
    // Preserve any lesson parameter until the user opens the cover.
    url.searchParams.set('entry', 'cover');
  }
  return url.href;
}

export function screenURL(screen, current, book) {
  const url = new URL(current);
  url.pathname = screen === 'library' ? '/library/' : '/';
  url.searchParams.delete('view');
  url.searchParams.delete('book');
  if (screen === 'library' && book) url.searchParams.set('book', book.id);
  url.hash = screen === 'library' ? '' : screen;
  return url.pathname + url.search + url.hash;
}
