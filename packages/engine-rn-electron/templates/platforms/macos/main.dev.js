// Modules to control application life and create native browser window
const { app, BrowserWindow, nativeImage } = require('electron');
const { initContextMenu } = require('./contextMenu')
if(initContextMenu) initContextMenu(createWindow)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const loadDevServer = () => {
    setTimeout(() => {
        mainWindow
            .loadURL('{{DEV_SERVER}}')
            .then(() => {})
            .catch((e) => {
                loadDevServer();
            });
    }, 1000);
};

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({{PLUGIN_INJECT_BROWSER_WINDOW}});

    // and load the index.html of the app.
    loadDevServer();

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// This applies logo to the application when it is displayed in the dock on macOS
const image = nativeImage.createFromPath("{{PLUGIN_INJECT_ICON_LOCATION}}");
app.dock.setIcon(image);

{{PLUGIN_INJECT_MAIN_PROCESS}}
