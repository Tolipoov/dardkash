// Integratsion testlar uchun muhit: vaqtinchalik Postgres (Docker), mock
// Telegram bilan backend, so'rov va ma'lumot yaratish yordamchilari.
// Jonli bazaga umuman tegmaydi.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const SERVER_DIR = path.join(__dirname, "..");
const JWT_SECRET = "test-secret-test-secret-test-secret";
const ADMIN_CHAT = "777";

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dardkash-test-"));
  const tgLog = path.join(tmp, "telegram.log");
  fs.writeFileSync(tgLog, "");
  const dbPort = await freePort();
  const container = `dardkash-test-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", container,
    "-e", "POSTGRES_USER=t", "-e", "POSTGRES_PASSWORD=t", "-e", "POSTGRES_DB=t",
    "-p", `127.0.0.1:${dbPort}:5432`, "postgres:16-alpine",
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      execFileSync("docker", ["exec", container, "pg_isready", "-U", "t", "-d", "t"], { stdio: "ignore" });
      break;
    } catch {
      await sleep(500);
    }
  }
  await sleep(1500);

  const apiPort = await freePort();
  const env = {
    ...process.env,
    PORT: String(apiPort),
    NODE_ENV: "test",
    DATABASE_URL: `postgres://t:t@127.0.0.1:${dbPort}/t`,
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:3999",
    GOOGLE_CLIENT_ID: "x",
    GOOGLE_CLIENT_SECRET: "x",
    GOOGLE_REDIRECT_URI: "http://localhost/x",
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_BOT_USERNAME: "dardkash_test_bot",
    TELEGRAM_WEBHOOK_SECRET: "whsecret",
    ADMIN_TELEGRAM_CHAT_ID: ADMIN_CHAT,
    LIVEKIT_API_KEY: "k",
    LIVEKIT_API_SECRET: "s".repeat(40),
    LIVEKIT_API_URL: "http://127.0.0.1:1",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    TG_MOCK_LOG: tgLog,
    NODE_OPTIONS: `--require ${path.join(__dirname, "mock-telegram.cjs")}`,
  };
  const logFile = path.join(tmp, "api.log");
  const out = fs.openSync(logFile, "a");
  const proc = spawn(path.join(SERVER_DIR, "node_modules/.bin/tsx"), ["src/index.ts"], {
    cwd: SERVER_DIR,
    env,
    stdio: ["ignore", out, out],
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    if (fs.readFileSync(logFile, "utf8").includes("ishga tushdi")) break;
    await sleep(250);
  }
  if (!fs.readFileSync(logFile, "utf8").includes("ishga tushdi")) {
    throw new Error("Backend ishga tushmadi:\n" + fs.readFileSync(logFile, "utf8"));
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const base = `http://127.0.0.1:${apiPort}`;

  const env_ = {
    base,
    pool,
    q: (sql, params) => pool.query(sql, params),
    token: (userId) => jwt.sign({ userId }, JWT_SECRET),
    async api(userId, method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { Cookie: "dardkash_session=" + env_.token(userId) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, body: json };
    },
    webhook(update) {
      return fetch(base + "/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "whsecret" },
        body: JSON.stringify(update),
      });
    },
    telegramSent() {
      return fs
        .readFileSync(tgLog, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((m) => m.method === "sendMessage");
    },
    adminChat: ADMIN_CHAT,
    apiLog: () => fs.readFileSync(logFile, "utf8"),
    async stop() {
      await pool.end().catch(() => {});
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {}
      try {
        execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
      } catch {}
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
  return env_;
}

// --- Test ma'lumoti ---
let counter = 0;
async function createUser(env, opts = {}) {
  counter += 1;
  const nickname = opts.nickname ?? `User${counter}`;
  const user = await env.q(
    "INSERT INTO users (email, google_id, telegram_id) VALUES ($1, $2, $3) RETURNING id",
    [`u${counter}@test`, opts.telegramOnly ? null : `g-${counter}-${Date.now()}`, opts.telegramId ?? null],
  );
  const id = user.rows[0].id;
  if (opts.noProfile) return id;
  await env.q(
    `INSERT INTO profiles (user_id, nickname, age_range, gender, wants, languages, preferred_listener_gender, role)
     VALUES ($1, $2, '25-34', $3, $4, $5, $6, $7)`,
    [
      id,
      nickname,
      opts.gender ?? "male",
      opts.wants ?? "speaker",
      opts.languages ?? ["uz"],
      opts.preferredGender ?? "any",
      opts.role ?? "user",
    ],
  );
  await env.q("INSERT INTO profile_topics (user_id, topic_code) VALUES ($1, 'family')", [id]);
  if (opts.listener) {
    await env.q(
      "INSERT INTO listener_profiles (user_id, bio, status) VALUES ($1, 'Odamlarni hukm qilmasdan tinglayman, shoshilmayman.', $2)",
      [id, opts.listener === true ? "approved" : opts.listener],
    );
    await env.q("INSERT INTO listener_topics (user_id, topic_code) VALUES ($1, 'family')", [id]);
  }
  return id;
}

module.exports = { startEnv, createUser, sleep };
