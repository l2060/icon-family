export function readProjectRoute(hash = window.location.hash): number | undefined {
  const match = /^#\/projects\/([1-9]\d*)(?:\/folders\/[a-zA-Z0-9-]+|\/all)?\/?$/.exec(hash);
  const id = match ? Number(match[1]) : undefined;
  return id !== undefined && Number.isSafeInteger(id) ? id : undefined;
}

export function readFolderRoute(hash = window.location.hash): string | undefined {
  return readProjectRoute(hash) ? /\/folders\/([a-zA-Z0-9-]+)\/?$/.exec(hash)?.[1] : undefined;
}
export function readAllRoute(hash = window.location.hash): boolean {
  return !!readProjectRoute(hash) && /\/all\/?$/.test(hash);
}
export function writeProjectRoute(
  id: number | undefined,
  replace = false,
  folderId?: string,
  showAll = false,
) {
  const hash =
    id === undefined
      ? '#/projects'
      : `#/projects/${id}${folderId ? `/folders/${folderId}` : showAll ? '/all' : ''}`;
  if (window.location.hash === hash) return;
  // History updates do not emit hashchange; the caller loads the project once.
  window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

export function isLoginRoute() {
  return /^#\/login(?:\?|$)/.test(window.location.hash);
}

export function loginDestination() {
  const query = window.location.hash.split('?')[1] || '';
  const redirect = new URLSearchParams(query).get('redirect') || '';
  const id = readProjectRoute(`#${redirect}`);
  const folder = readFolderRoute(`#${redirect}`);
  return id
    ? `#/projects/${id}${folder ? `/folders/${folder}` : readAllRoute(`#${redirect}`) ? '/all' : ''}`
    : '#/projects';
}

export function guardRoute(authenticated: boolean) {
  let next: string | undefined;
  if (authenticated && isLoginRoute()) next = loginDestination();
  if (!authenticated && !isLoginRoute()) {
    const id = readProjectRoute();
    const folder = readFolderRoute();
    next = id
      ? `#/login?redirect=${encodeURIComponent(`/projects/${id}${folder ? `/folders/${folder}` : readAllRoute() ? '/all' : ''}`)}`
      : '#/login';
  }
  if (next && next !== window.location.hash) {
    window.history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}
