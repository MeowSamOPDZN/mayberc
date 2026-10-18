// Hash routing + handle validation. Pure, no DOM.
export const ROUTES = {
  HOME: 'home',
  TOWNHALL: 'townhall',
  FIND: 'find',
  ABOUT: 'about',
  PRIVACY: 'privacy',
};

// Handles: 2-20 chars, letters, numbers, dots, underscores.
const HANDLE_RE = /^[A-Za-z0-9_.]{2,20}$/;

// Parse a location.hash string into a route object.
export function parseHash(hash) {
  const h = (hash || '').trim();
  if (!h || h === '#' || h === '#/') return { route: ROUTES.HOME };
  const m = h.match(/^#\/find\/([A-Za-z0-9_.]{2,20})$/);
  if (m) return { route: ROUTES.FIND, handle: m[1].toLowerCase() };
  if (h === '#/townhall') return { route: ROUTES.TOWNHALL };
  if (h === '#/about') return { route: ROUTES.ABOUT };
  if (h === '#/privacy') return { route: ROUTES.PRIVACY };
  return { route: ROUTES.HOME };
}

export function findUrl(handle) {
  return '#/find/' + encodeURIComponent(String(handle).toLowerCase());
}

// A handle is 2-20 chars: letters, numbers, dots, underscores.
export function isValidHandle(name) {
  return HANDLE_RE.test(String(name || '').trim());
}

export function normalizeHandle(name) {
  return String(name || '').trim().toLowerCase();
}
