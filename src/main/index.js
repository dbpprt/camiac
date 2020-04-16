'use strict';

import {
  app,
  BrowserWindow,
  screen,
  globalShortcut,
  Menu,
  Tray,
} from 'electron';
import * as path from 'path';
import { format as formatUrl } from 'url';
import { store } from './store';

const isDevelopment = process.env.NODE_ENV !== 'production';

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow;

function createMainWindow() {
  const display = screen.getPrimaryDisplay();

  const window = new BrowserWindow({
    width: store.get('presenter.width'),
    height: store.get('presenter.height'),
    x: display.bounds.width - store.get('presenter.width'),
    y: display.bounds.height - store.get('presenter.height'),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: { nodeIntegration: true, backgroundThrottling: false },
  });

  if (isDevelopment) {
    window.webContents.openDevTools();
  }

  if (isDevelopment) {
    window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`);
  } else {
    window.loadURL(
      formatUrl({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true,
      })
    );
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.on('devtools-opened', () => {
    window.focus();
    setImmediate(() => {
      window.focus();
    });
  });

  let isShown = false;
  window
    .on('show', () => {
      isShown = true;
    })
    .on('hide', () => {
      isShown = false;
    })
    .on('minimize', () => {
      isShown = false;
    });

  globalShortcut.register(store.get('presenter.globalShortcut'), () => {
    isShown ? window.hide() : window.show();
  });

  return window;
}

// quit application when all windows are closed
app.on('window-all-closed', () => {
  // on macOS it is common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // on macOS it is common to re-create a window even after all windows have been closed
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});

// create main BrowserWindow when electron is ready
app.on('ready', () => {
  console.log(store.get('bodyPix.internalResolution'));
  // let appIcon = new Tray();

  // const contextMenu = Menu.buildFromTemplate([
  //   { label: 'Item1', type: 'radio' },
  //   { label: 'Item2', type: 'radio' },
  // ]);

  // contextMenu.items[1].checked = false;
  // appIcon.setContextMenu(contextMenu);

  mainWindow = createMainWindow();
});
