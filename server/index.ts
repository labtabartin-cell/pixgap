import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate } from './lib/db.js';

type SessionUser = { id: number; name: string; handle: string };
type ChatRow = { id: number; title: string; code: string; created_at: string; last_body: string | null; last_at: string | null; member_count: number };
type MessageRow = { id: number; body: string; created_at: string; sender_id: number; sender_name: string; sender_handle: string };

migrate(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
`);

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const distRoot = join(projectRoot, 'dist');

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(distRoot)) return false;

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(distRoot, requested));

  if (!filePath.startsWith(distRoot)) return false;

  if (existsSync(filePath)) {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(content);
    return true;
  }

  // Vite/React client-side routes should fall back to index.html.
  const indexPath = join(distRoot, 'index.html');
  if (existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(indexPath));
    return true;
  }

  return false;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const parts: Buffer[] = [];
  for await (const piece of req) {
    parts.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece));
    if (Buffer.concat(parts).length > 100_000) throw new Error('حجم درخواست بیش از حد مجاز است.');
  }
  const content = Buffer.concat(parts).toString('utf8');
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('اطلاعات ارسالی معتبر نیست.');
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createToken(): string {
  return randomBytes(32).toString('hex');
}

function createCode(): string {
  let code = '';
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (db.prepare('SELECT 1 FROM chats WHERE code = ?').get(code));
  return code;
}

function currentUser(req: IncomingMessage): SessionUser | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return (db.prepare(`SELECT users.id, users.name, users.handle FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?`).get(token) as SessionUser | undefined) ?? null;
}

function requireUser(req: IncomingMessage, res: ServerResponse): SessionUser | null {
  const user = currentUser(req);
  if (!user) json(res, 401, { error: 'نشست شما تمام شده؛ دوباره وارد شوید.' });
  return user;
}

function hasMembership(chatId: number, userId: number): boolean {
  return Boolean(db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId));
}

function chatForUser(chatId: number, userId: number): ChatRow | null {
  return (db.prepare(`
    SELECT chats.id, chats.title, chats.code, chats.created_at,
      (SELECT body FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM chat_members WHERE chat_id = chats.id) AS member_count
    FROM chats
    JOIN chat_members ON chat_members.chat_id = chats.id
    WHERE chats.id = ? AND chat_members.user_id = ?
  `).get(chatId, userId) as ChatRow | undefined) ?? null;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true });

    // Serve the Vite-built React app for normal browser requests.
    if (req.method === 'GET' && !path.startsWith('/api/')) {
      if (serveStatic(path, res)) return;
    }

    if (req.method === 'POST' && path === '/api/auth/register') {
      const body = await readBody(req);
      const name = text(body.name).slice(0, 60);
      const handle = text(body.handle).replace(/^@/, '').toLowerCase();
      const password = text(body.password);
      if (name.length < 2) return json(res, 400, { error: 'نام شما باید حداقل دو حرف باشد.' });
      if (!/^[a-z0-9_.-]{3,30}$/i.test(handle)) return json(res, 400, { error: 'نام کاربری فقط از حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط تشکیل می‌شود.' });
      if (password.length < 6) return json(res, 400, { error: 'رمز ورود حداقل شش کاراکتر باشد.' });
      if (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)) return json(res, 409, { error: 'این نام کاربری قبلاً گرفته شده است.' });
      const result = db.prepare('INSERT INTO users (name, handle, password) VALUES (?, ?, ?)').run(name, handle, password);
      const user = { id: Number(result.lastInsertRowid), name, handle };
      const token = createToken();
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
      return json(res, 201, { token, user });
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      const body = await readBody(req);
      const handle = text(body.handle).replace(/^@/, '').toLowerCase();
      const password = text(body.password);
      const user = db.prepare('SELECT id, name, handle FROM users WHERE handle = ? AND password = ?').get(handle, password) as SessionUser | undefined;
      if (!user) return json(res, 401, { error: 'نام کاربری یا رمز ورود درست نیست.' });
      const token = createToken();
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
      return json(res, 200, { token, user });
    }

    if (req.method === 'GET' && path === '/api/me') {
      const user = requireUser(req, res);
      if (!user) return;
      return json(res, 200, { user });
    }

    if (req.method === 'GET' && path === '/api/chats') {
      const user = requireUser(req, res);
      if (!user) return;
      const chats = db.prepare(`
        SELECT chats.id, chats.title, chats.code, chats.created_at,
          (SELECT body FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1) AS last_body,
          (SELECT created_at FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1) AS last_at,
          (SELECT COUNT(*) FROM chat_members WHERE chat_id = chats.id) AS member_count
        FROM chats JOIN chat_members ON chat_members.chat_id = chats.id
        WHERE chat_members.user_id = ?
        ORDER BY COALESCE((SELECT id FROM messages WHERE chat_id = chats.id ORDER BY id DESC LIMIT 1), chats.id) DESC
      `).all(user.id) as ChatRow[];
      return json(res, 200, { chats });
    }

    if (req.method === 'POST' && path === '/api/chats') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const title = text(body.title).slice(0, 80);
      if (title.length < 2) return json(res, 400, { error: 'نام گفت‌وگو باید حداقل دو حرف باشد.' });
      const code = createCode();
      const result = db.prepare('INSERT INTO chats (title, code) VALUES (?, ?)').run(title, code);
      const chatId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, user.id);
      const chat = chatForUser(chatId, user.id);
      return json(res, 201, { chat });
    }

    if (req.method === 'POST' && path === '/api/chats/join') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const code = text(body.code).replace(/\D/g, '');
      const chat = db.prepare('SELECT id FROM chats WHERE code = ?').get(code) as { id: number } | undefined;
      if (!chat) return json(res, 404, { error: 'گفت‌وگویی با این کد پیدا نشد.' });
      db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chat.id, user.id);
      return json(res, 200, { chat: chatForUser(chat.id, user.id) });
    }

    const messageMatch = path.match(/^\/api\/chats\/(\d+)\/messages$/);
    if (messageMatch && req.method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      const chatId = Number(messageMatch[1]);
      if (!hasMembership(chatId, user.id)) return json(res, 403, { error: 'به این گفت‌وگو دسترسی ندارید.' });
      const messages = db.prepare(`
        SELECT messages.id, messages.body, messages.created_at, messages.sender_id, users.name AS sender_name, users.handle AS sender_handle
        FROM messages JOIN users ON users.id = messages.sender_id
        WHERE messages.chat_id = ? ORDER BY messages.id ASC LIMIT 500
      `).all(chatId) as MessageRow[];
      return json(res, 200, { messages });
    }

    if (messageMatch && req.method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const chatId = Number(messageMatch[1]);
      if (!hasMembership(chatId, user.id)) return json(res, 403, { error: 'به این گفت‌وگو دسترسی ندارید.' });
      const body = (await readBody(req)).body;
      const messageBody = text(body).slice(0, 4000);
      if (!messageBody) return json(res, 400, { error: 'متن پیام خالی است.' });
      const result = db.prepare('INSERT INTO messages (chat_id, sender_id, body) VALUES (?, ?, ?)').run(chatId, user.id, messageBody);
      const message = db.prepare(`
        SELECT messages.id, messages.body, messages.created_at, messages.sender_id, users.name AS sender_name, users.handle AS sender_handle
        FROM messages JOIN users ON users.id = messages.sender_id WHERE messages.id = ?
      `).get(Number(result.lastInsertRowid)) as MessageRow;
      return json(res, 201, { message });
    }

    return json(res, 404, { error: 'این بخش پیدا نشد.' });
  } catch (error) {
    console.error('Request failed', { method: req.method, path, error });
    const message = error instanceof Error ? error.message : 'خطای ناشناخته';
    return json(res, 500, { error: message === 'اطلاعات ارسالی معتبر نیست.' || message === 'حجم درخواست بیش از حد مجاز است.' ? message : 'مشکلی در انجام درخواست پیش آمد.' });
  }
}

const server = createServer((req, res) => { void route(req, res); });
server.listen(Number(process.env.PORT ?? 3001), () => console.log('HamGap server is running'));
