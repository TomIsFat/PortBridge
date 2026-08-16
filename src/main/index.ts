import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { createAppServices, registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const services = createAppServices();

process.on('uncaughtException', (error) => {
  services.logService.error(`未捕获异常：${error instanceof Error ? error.message : String(error)}`);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  services.logService.error(`未处理的 Promise 异常：${message}`);
});

function getWindowIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'build/icon.png');
}

function setAppIcon(): void {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getWindowIconPath());
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getWindowIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('PortBridge');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主界面', click: showMainWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
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
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
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
  // 关闭窗口后保留在系统托盘继续运行，真正的退出由“退出”菜单或 before-quit 处理。
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  void services.tunnelManager.stopAll().finally(() => {
    app.quit();
  });
});
