import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { createAppServices, registerIpcHandlers } from './ipc';
import {
  getTrayIconSize,
  shouldCloseToTray,
  shouldCreateTray,
  shouldHideDockWhenHidingWindow,
  shouldQuitOnLastWindow
} from './trayPolicy';

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

function createTray(): void {
  if (!shouldCreateTray(process.platform, process.env.XDG_CURRENT_DESKTOP)) return;

  try {
    const icon = nativeImage.createFromPath(getWindowIconPath());
    if (icon.isEmpty()) return;

    const iconSize = getTrayIconSize(process.platform);
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
    if (shouldCloseToTray(isQuitting, Boolean(tray))) {
      event.preventDefault();
      mainWindow?.hide();
      if (shouldHideDockWhenHidingWindow(process.platform)) {
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
  if (shouldQuitOnLastWindow(Boolean(tray), process.platform)) {
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
