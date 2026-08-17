export function isLinuxTrayReliable(xdgCurrentDesktop = ''): boolean {
  const desktops = xdgCurrentDesktop.toLowerCase().split(':').filter(Boolean);
  if (desktops.length === 0) return false;
  return !desktops.includes('gnome');
}

export function shouldCreateTray(platform: string, xdgCurrentDesktop = ''): boolean {
  if (platform === 'win32' || platform === 'darwin') return true;
  if (platform === 'linux') return isLinuxTrayReliable(xdgCurrentDesktop);
  return false;
}

export function getTrayIconSize(platform: string): number {
  return platform === 'darwin' ? 22 : 16;
}

export function shouldCloseToTray(isQuitting: boolean, hasTray: boolean): boolean {
  return !isQuitting && hasTray;
}

export function shouldQuitOnLastWindow(hasTray: boolean, platform: string): boolean {
  if (platform === 'darwin') return false;
  return !hasTray;
}

export function shouldHideDockWhenHidingWindow(platform: string): boolean {
  return platform === 'darwin';
}
