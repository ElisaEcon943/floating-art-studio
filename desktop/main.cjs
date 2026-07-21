const { app, BrowserWindow, shell } = require("electron");

const APP_URL = process.env.FLOATING_STUDIO_URL || "https://floating-art-studio.peihonghuang8821.chatgpt.site";

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#17152e",
    autoHideMenuBar: true,
    title: "浮游画室",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(APP_URL).catch(() => {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;background:#17152e;color:#f4f0e6;font-family:Arial;display:grid;place-items:center;min-height:100vh;text-align:center}main{max-width:520px;padding:40px}b{font-size:32px;color:#c8ff3d}p{line-height:1.8;color:#aaa6bb}button{background:#ff6b55;color:white;border:0;padding:13px 24px;font-weight:bold;cursor:pointer}</style><main><b>浮游画室暂时离线</b><p>桌面版需要联网加载智能模型与工作台。请检查网络后重新打开应用。</p><button onclick="location.href='${APP_URL}'">重新连接</button></main></html>`)}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
