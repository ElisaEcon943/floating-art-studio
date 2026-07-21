const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const mime = { ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".json":"application/json", ".wasm":"application/wasm", ".woff2":"font/woff2" };

function getDistRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "dist")
    : path.join(app.getAppPath(), "dist");
}

async function staticResponse(distRoot, pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(path.join(distRoot, "client", clean));
  const clientRoot = path.resolve(path.join(distRoot, "client"));
  if (!target.startsWith(clientRoot + path.sep)) return new Response("Forbidden", { status: 403 });
  try {
    return new Response(await fs.readFile(target), { headers: { "content-type": mime[path.extname(target)] || "application/octet-stream" } });
  } catch { return new Response("Not found", { status: 404 }); }
}

async function startStudioServer() {
  const distRoot = getDistRoot();
  const worker = (await import(pathToFileURL(path.join(distRoot, "server", "index.js")).href)).default;
  const server = http.createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const url = new URL(req.url || "/", origin);
      let response;
      if (url.pathname.startsWith("/assets/") || /\.(svg|png|jpg|jpeg|webp|woff2|wasm|json)$/.test(url.pathname)) {
        response = await staticResponse(distRoot, url.pathname);
      } else {
        const request = new Request(url, { method: req.method, headers: req.headers });
        const env = { ASSETS: { fetch: async input => staticResponse(distRoot, new URL(input.url).pathname) } };
        response = await worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(500, { "content-type":"text/plain;charset=utf-8" });
      res.end(`浮游画室启动失败\n${error?.message || error}`);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, url:`http://127.0.0.1:${server.address().port}` };
}

let studioServer;
async function createWindow() {
  if (!studioServer) studioServer = await startStudioServer();
  const win = new BrowserWindow({ width:1480, height:940, minWidth:980, minHeight:680, backgroundColor:"#17152e", autoHideMenuBar:true, title:"浮游画室", webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true } });
  win.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return { action:"deny" }; });
  await win.loadURL(studioServer.url);
}

app.whenReady().then(createWindow);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => studioServer?.server?.close());
