const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let backendProcess = null;

function startBackend() {
  if (!app.isPackaged) return; // در حالت توسعه بک‌اند رو دستی اجرا کن

  const exePath = path.join(
    process.resourcesPath,
    'backend',
    'error-messenger-backend.exe'
  );

  if (!fs.existsSync(exePath)) {
    console.error('Backend exe not found:', exePath);
    return;
  }

  backendProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    windowsHide: true,
    stdio: 'ignore',
  });

  backendProcess.on('error', (err) => console.error('Backend error:', err));
  backendProcess.on('exit', (code) => {
    console.log('Backend exited with code', code);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // No native menu bar. autoHideMenuBar keeps Alt from restoring one on Windows.
  win.setMenu(null);

  // Keep the debugging shortcuts that the removed default menu used to provide.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isDevTools =
      input.key === 'F12' ||
      (input.control && !input.alt && input.shift && input.key.toLowerCase() === 'i');
    if (isDevTools) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // لینک‌های خارجی توی مرورگر پیش‌فرض باز بشن
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);