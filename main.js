const {
    app, BrowserWindow, Tray, Menu, desktopCapturer,
    systemPreferences, dialog, shell, ipcMain, Notification,
} = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
const isDebugMode = process.env.ELECTRON_ENABLE_LOGGING;

let tray = null;
let isRecording = false;
let mainWindow = null;

// 开始录制函数
async function startRecording() {
    try {
        console.log('主进程: 开始录制');
        
        // 确保窗口存在并已加载完成
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
            // 等待窗口加载完成
            await new Promise((resolve) => {
                mainWindow.webContents.once('did-finish-load', resolve);
            });
        }

        // 确保渲染进程已准备就绪
        if (mainWindow.webContents.isLoading()) {
            await new Promise((resolve) => {
                mainWindow.webContents.once('did-finish-load', resolve);
            });
        }

        // 发送开始录制信号
        if (!mainWindow.webContents.isCrashed()) {
            mainWindow.webContents.send('start-recording');
            console.log('主进程: 已发送开始录制信号');
            updateTrayMenu(true);
        } else {
            throw new Error('渲染进程已崩溃');
        }
    } catch (error) {
        console.error('主进程: 启动录制失败:', error);
        dialog.showErrorBox('错误', `启动录制失败: ${error.message}`);
        updateTrayMenu(false);
    }
}

async function stopRecording() {
    try {
        console.log('主进程: 停止录制');

        // 检查渲染进程状态
        if (mainWindow.webContents.isCrashed()) {
            console.log('主进程: 渲染进程已崩溃，重新加载');
            mainWindow.reload();
        }

        // 发送停止信号
        if (mainWindow?.webContents && !mainWindow.webContents.isCrashed()) {
            mainWindow.webContents.send('stop-recording');
            console.log('主进程: 已发送停止录制信号');
            // eslint-disable-next-line no-use-before-define
            updateTrayMenu(false);
        } else {
            throw new Error('渲染进程未就绪');
        }
    } catch (error) {
        console.error('主进程: 停止录制失败:', error);
        // 显示错误对话框
        dialog.showErrorBox('错误', '停止录制失败，请重试');
    }
}

function updateTrayMenu(recording) {
    isRecording = recording;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '开始录制',
            enabled: !recording,
            click: async () => {
                await startRecording();
                updateTrayMenu(true);
            },
        },
        {
            label: '停止录制',
            enabled: recording,
            click: async () => {
                await stopRecording();
                updateTrayMenu(false);
            },
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => quitApp(),
        },
    ]);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    tray = new Tray(iconPath);

    // macOS 特定设置
    if (process.platform === 'darwin') {
        tray.setIgnoreDoubleClickEvents(true); // 忽略双击事件
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '开始录制',
            click: async () => {
                if (!isRecording) {
                    await startRecording();
                    updateTrayMenu(true);
                }
            },
        },
        {
            label: '停止录制',
            enabled: false,
            click: async () => {
                if (isRecording) {
                    await stopRecording();
                    updateTrayMenu(false);
                }
            },
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => quitApp(),
        },
    ]);

    tray.setToolTip('Quick Recorder');
    tray.setContextMenu(contextMenu);
}

function createWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: isDebugMode,
        skipTaskbar: true,
        frame: true,
        transparent: true,
        alwaysOnTop: false,
        hasShadow: false,
        center: true,
        resizable: isDebugMode,
        minimizable: false,
        maximizable: false,
        closable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            // 添加对 ES 模块的支持
            webviewTag: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            // 支持 ES 模块
            nativeWindowOpen: true,
            worldSafeExecuteJavaScript: true,
        },
    });

    // 加载页面
    mainWindow.loadFile('index.html');

    // 在开发模式下自动打开开发者工具
    if (isDebugMode) {
        mainWindow.webContents.openDevTools();
    }

    // 监听窗口加载完成
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('主进程: 窗口加载完成');
    });

    // 监听渲染进程崩溃
    mainWindow.webContents.on('crashed', () => {
        console.log('主进程: 渲染进程崩溃');
        dialog.showErrorBox('错误', '渲染进程崩溃，请重试');
        updateTrayMenu(false);
    });

    // 监听渲染进程未响应
    mainWindow.on('unresponsive', () => {
        console.log('主进程: 渲染进程无响应');
        dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: '应用无响应',
            message: '应用暂时无响应，是否重新加载？',
            buttons: ['重新加载', '等待'],
            defaultId: 0,
        }).then(({ response }) => {
            if (response === 0) {
                mainWindow.reload();
            }
        });
    });
}

async function checkAndRequestPermissions() {
    // 检查持久化的权限状态
    const savedMicPermission = store.get('micPermission');
    const savedScreenPermission = store.get('screenPermission');

    if (savedMicPermission === 'granted' && savedScreenPermission === 'granted') {
        return true;
    }

    // 检查麦克风权限
    const micPermission = systemPreferences.getMediaAccessStatus('microphone');

    if (micPermission === 'granted') {
        store.set('micPermission', 'granted');
    } else if (micPermission !== 'granted') {
    // 请求麦克风权限
        const granted = await systemPreferences.askForMediaAccess('microphone');
        if (!granted) {
            dialog.showMessageBox({
                type: 'warning',
                title: '需要麦克风权限',
                message: '录音功能需要麦克风权限',
                buttons: ['打开系统设置', '取消'],
                defaultId: 0,
            }).then((result) => {
                if (result.response === 0) {
                    // 使用 shell.openExternal 打开系统偏好设置
                    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
                }
            });
            return false;
        }
        if (granted) {
            store.set('micPermission', 'granted');
        }
    }

    // 检查屏幕录制权限
    if (process.platform === 'darwin') {
        const screenPermission = systemPreferences.getMediaAccessStatus('screen');
        if (screenPermission === 'granted') {
            store.set('screenPermission', 'granted');
        } else if (screenPermission !== 'granted') {
            dialog.showMessageBox({
                type: 'warning',
                title: '需要屏幕录制权限',
                message: '录制系统声音需要屏幕录制权限',
                detail: '请在系统偏好设置 > 安全性与隐私 > 隐私 > 屏幕录制 中授权本应用',
                buttons: ['打开系统设置', '取消'],
                defaultId: 0,
            }).then((result) => {
                if (result.response === 0) {
                    // 使用 shell.openExternal 打开系统偏好设置的屏幕录制页面
                    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
                }
            });
            return false;
        }
        // 在用户授权后保存状态
        const newScreenPermission = systemPreferences.getMediaAccessStatus('screen');
        if (newScreenPermission === 'granted') {
            store.set('screenPermission', 'granted');
        }
    }

    return store.get('micPermission') === 'granted'
         && (process.platform !== 'darwin' || store.get('screenPermission') === 'granted');
}

// 添加 IPC handlers
ipcMain.handle('start-recording', async () => {
    try {
        const hasPermissions = await checkAndRequestPermissions();
        if (!hasPermissions) return false;

        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
            await new Promise((resolve) => {
                mainWindow.webContents.once('did-finish-load', resolve);
            });
        }

        mainWindow.show();
        updateTrayMenu(true);
        return true;
    } catch (error) {
        console.error('启动录制失败:', error);
        dialog.showErrorBox('错误', '启动录制失败');
        return false;
    }
});

ipcMain.handle('pause-recording', () => {
    try {
        updateTrayMenu(false);
        return true;
    } catch (error) {
        console.error('暂停录制失败:', error);
        return false;
    }
});

ipcMain.handle('stop-recording', () => {
    try {
        updateTrayMenu(false);
        return true;
    } catch (error) {
        console.error('停止录制失败:', error);
        return false;
    }
});

// 添加新的 IPC 处理程序
ipcMain.handle('get-sources', async (event, opts) => {
    try {
        const sources = await desktopCapturer.getSources(opts);
        return sources;
    } catch (error) {
        console.error('Error getting sources:', error);
        return [];
    }
});

// 添加 IPC 处理程序
ipcMain.handle('save-recording', async (event, blob) => {
    console.log('主进程: 开始保存录音文件');
    try {
        const date = new Date();
        const defaultPath = path.join(
            app.getPath('downloads'),
            `recording-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}.webm`,
        );

        console.log('主进程: 显示保存对话框');
        const result = await dialog.showSaveDialog({
            title: '保存录音文件',
            defaultPath,
            filters: [
                { name: 'WebM 文件', extensions: ['webm'] },
                { name: '所有文件', extensions: ['*'] },
            ],
        });

        if (!result.canceled && result.filePath) {
            console.log('主进程: 保存文件到:', result.filePath);
            fs.writeFileSync(result.filePath, Buffer.from(blob));
            new Notification({
                title: '录音已保存',
                body: `文件已保存到: ${result.filePath}`,
            }).show();
            return { success: true, path: result.filePath };
        }
        console.log('主进程: 用户取消保存');
        return { success: false, error: 'User cancelled' };
    } catch (error) {
        console.error('主进程: 保存文件时出错:', error);
        dialog.showErrorBox('保存失败', '保存录音文件时出现错误');
        return { success: false, error: error.message };
    }
});

// 退出应用程序
function quitApp() {
    if (mainWindow) {
        mainWindow.destroy();
    }
    app.quit();
    if (process.platform !== 'darwin') {
        app.exit(0);
    }
}

if (process.platform === 'darwin') {
    // app.dock.hide()  // 在 macOS 中隐藏 dock 图标
}

app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
