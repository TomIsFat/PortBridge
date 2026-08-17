import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { createAppServices, registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const services = createAppServices();

function getWindowIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'build/icon.png');
}

function setAppIcon(): void {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getWindowIconPath());
  }
}

function showMainWindow(): void {
  if (process.platform === 'darwin') {
    app.dock?.show();
  }
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

function isLinuxTrayReliable(xdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP ?? ''): boolean {
  const desktops = xdgCurrentDesktop.toLowerCase().split(':').filter(Boolean);
  if (desktops.length === 0) return false;
  return !desktops.includes('gnome');
}

function shouldCreateTray(): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') return true;
  if (process.platform === 'linux') return isLinuxTrayReliable();
  return false;
}

function createTray(): void {
  if (!shouldCreateTray()) return;

  try {
    const icon = nativeImage.createFromPath(getWindowIconPath());
    if (icon.isEmpty()) return;

    const iconSize = process.platform === 'darwin' ? 22 : 16;
    tray = new Tray(icon.resize({ width: iconSize, height: iconSize, quality: 'best' }));
    tray.setToolTip('PortBridge');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主界面', click: showMainWindow },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    );
    tray.on('click', showMainWindow);
    tray.on('double-click', showMainWindow);
  } catch (error) {
    destroyTray();
    services.logService.error(error instanceof Error ? error.message : '创建系统托盘失败');
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1060,
    minHeight: 680,
    title: 'PortBridge',
    icon: getWindowIconPath(),
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow?.setTitle('PortBridge');
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  setAppIcon();
  registerIpcHandlers(services);
  createWindow();
  createTray();
  void services.tunnelManager.startAutoStartTunnels().catch((error) => {
    services.logService.error(error instanceof Error ? error.message : '自动启动映射失败');
  });

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  destroyTray();
  await services.tunnelManager.stopAll();
  app.exit(0);
});
