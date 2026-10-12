import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'dist');
const backendPort = Number(process.env.BACKEND_PORT || 3001);
const port = Number(process.env.PORT || 10000);

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'server/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(backendPort) },
  stdio: 'inherit'
});

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon'
};

function proxyHttp(req, res) {
  const proxyReq = http.request({
    hostname: '127.0.0.1', port: backendPort, method: req.method,
    path: req.url, headers: { ...req.headers, host: '127.0.0.1:' + backendPort }
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) return proxyHttp(req, res);
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const safe = path.normalize(pathname).replace(/^(..[/\\])+/, '');
  let file = path.join(publicDir, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(publicDir)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(publicDir, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, client => {
    const target = new WebSocket('ws://127.0.0.1:' + backendPort + req.url, {
      headers: { ...req.headers, host: '127.0.0.1:' + backendPort }
    });
    client.on('message', data => { if (target.readyState === WebSocket.OPEN) target.send(data); });
    client.on('close', () => target.close());
    client.on('error', () => target.close());
    target.on('message', data => { if (client.readyState === WebSocket.OPEN) client.send(data); });
    target.on('close', () => client.close());
    target.on('error', () => client.close());
  });
});

server.listen(port, () => console.log('Pixgap web server listening on ' + port));
process.on('SIGTERM', () => { child.kill('SIGTERM'); server.close(); });
process.on('SIGINT', () => { child.kill('SIGINT'); server.close(); });
