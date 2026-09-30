export function getMeetingCodeFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/meet\/([A-Za-z0-9]{6,12})\/?$/);
  return match ? match[1].toUpperCase() : null;
}

export function getMeetingUrl(roomCode) {
  if (!roomCode) return window.location.origin;
  return `${window.location.origin}/meet/${encodeURIComponent(roomCode)}`;
}

export function goToMeeting(roomCode, { replace = false } = {}) {
  const url = `/meet/${encodeURIComponent(roomCode)}`;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function goToDashboard({ replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
