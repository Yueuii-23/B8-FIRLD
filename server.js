// 零依赖静态开发服务器：支持 npm run dev，并透传 --host / --port 参数
// 用法：npm run dev [-- --host 127.0.0.1 --port 7100]
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function argOf(names, dflt) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n) return args[i + 1];
      if (a.startsWith(n + "=")) return a.slice(n.length + 1);
    }
  }
  return dflt;
}
const HOST = argOf(["--host", "-H"], "127.0.0.1");
const PORT = parseInt(argOf(["--port", "-p"], "7100"), 10);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".mp4": "video/mp4"
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found: " + urlPath); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`「田 · 档案之野」dev server 已启动: http://${HOST}:${PORT}/`);
});
