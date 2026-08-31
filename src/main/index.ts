import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppServices, registerIpcHandlers } from './ipc';
import {
  getTrayIconSize,
  shouldCloseToTray,
  shouldCreateTray,
  shouldHideDockWhenHidingWindow,
  shouldQuitOnLastWindow,
  shouldShowWindowOnTrayClick
} from './trayPolicy';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const services = createAppServices();

function getWindowIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'build/icon.png');
}

function getMacTrayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate@2x.png')
    : join(process.cwd(), 'build/trayTemplate@2x.png');
}

function createTrayIcon(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    const trayIcon = nativeImage.createFromBuffer(readFileSync(getMacTrayIconPath()), { scaleFactor: 2 });
    trayIcon.setTemplateImage(true);
    return trayIcon;
  }

  const icon = nativeImage.createFromPath(getWindowIconPath());
  const iconSize = getTrayIconSize(process.platform);
  return icon.resize({ width: iconSize, height: iconSize, quality: 'best' });
}

function setAppIcon(): void {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getWindowIconPath());
  }
}

function hideWindowMenuBar(): void {
  if (process.platform === 'darwin') return;
  Menu.setApplicationMenu(null);
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
    const trayIcon = createTrayIcon();
    if (trayIcon.isEmpty()) {
      services.logService.error('系统托盘图标为空，已跳过创建');
      return;
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('PortBridge');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主界面', click: showMainWindow },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    );
    if (shouldShowWindowOnTrayClick(process.platform)) {
      tray.on('click', showMainWindow);
      tray.on('double-click', showMainWindow);
    }
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
  hideWindowMenuBar();
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
