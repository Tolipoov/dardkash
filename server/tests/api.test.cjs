// Integratsion testlar: `cd server && npm test`. Docker kerak (vaqtinchalik
// Postgres). Jonli bazaga tegmaydi, Telegram so'rovlari ushlab olinadi.
const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { startEnv, createUser, sleep } = require("./helpers.cjs");

let env;
before(async () => {
  env = await startEnv();
});
after(async () => {
  await env?.stop();
});

const profileBody = (overrides = {}) => ({
  nickname: "Sinovchi",
  ageRange: "25-34",
  gender: "male",
  phone: "",
  wants: "speaker",
  topics: ["family"],
  languages: ["uz"],
  preferredListenerGender: "any",
  language: "uz",
  ...overrides,
});

describe("profil", () => {
  it("emoji taxallus uzunligi belgi bo'yicha sanaladi", async () => {
    const id = await createUser(env, { noProfile: true });
    const one = await env.api(id, "POST", "/api/profile", profileBody({ nickname: "🗿" }));
    assert.equal(one.status, 400);
    assert.equal(one.body.code, "nickname_length");
    const two = await env.api(id, "POST", "/api/profile", profileBody({ nickname: "🗿🗿" }));
    assert.equal(two.status, 200);
  });

  it("telefon: bo'sh '+998' saqlanmaydi, chala raqam rad etiladi", async () => {
    const id = await createUser(env, { noProfile: true });
    const partial = await env.api(id, "POST", "/api/profile", profileBody({ nickname: "Tel1", phone: "+998 90 12" }));
    assert.equal(partial.body.code, "phone_invalid");
    await env.api(id, "POST", "/api/profile", profileBody({ nickname: "Tel1", phone: "+998 " }));
    const saved = await env.api(id, "GET", "/api/profile");
    assert.equal(saved.body.profile.phone, null);
  });

  it("taxallus takrorlanmaydi, mavzular 5 tadan oshmaydi, avatar ro'yxatdan", async () => {
    await createUser(env, { nickname: "Band" });
    const id = await createUser(env, { noProfile: true });
    assert.equal((await env.api(id, "POST", "/api/profile", profileBody({ nickname: "band" }))).body.code, "nickname_taken");
    const six = ["family", "work", "study", "stress", "health", "grief"];
    assert.equal((await env.api(id, "POST", "/api/profile", profileBody({ nickname: "Olti", topics: six }))).body.code, "topics_max");
    assert.equal((await env.api(id, "POST", "/api/profile", profileBody({ nickname: "Ava", avatar: "dragon" }))).body.code, "avatar_invalid");
    assert.equal((await env.api(id, "POST", "/api/profile", profileBody({ nickname: "Ava", avatar: "moon" }))).status, 200);
  });

  it("profilsiz odam qo'ng'iroq/taklif/xabar boshlay olmaydi", async () => {
    const listener = await createUser(env, { listener: true });
    const id = await createUser(env, { noProfile: true });
    for (const [url, body] of [
      ["/api/session/start", { listenerId: listener }],
      ["/api/invites", { listenerId: listener }],
      ["/api/conversations", { listenerId: listener, message: "salom" }],
    ]) {
      const res = await env.api(id, "POST", url, body);
      assert.equal(res.status, 400, url);
      assert.equal(res.body.code, "no_profile", url);
    }
    const sessions = await env.q("SELECT count(*)::int c FROM sessions WHERE speaker_id = $1", [id]);
    assert.equal(sessions.rows[0].c, 0);
  });
});

describe("maxfiylik", () => {
  it("dardkash profili ochiq, lekin telefon/jins bermaydi", async () => {
    const viewer = await createUser(env);
    const listener = await createUser(env, { listener: true });
    const res = await env.api(viewer, "GET", `/api/listeners/${listener}/profile`);
    assert.equal(res.status, 200);
    assert.ok(!("phone" in res.body.profile) && !("gender" in res.body.profile));
    const pending = await createUser(env, { listener: "pending" });
    assert.equal((await env.api(viewer, "GET", `/api/listeners/${pending}/profile`)).status, 404);
  });

  it("dardini aytuvchining mini-profili faqat aloqadagi dardkashga", async () => {
    const speaker = await createUser(env);
    const contact = await createUser(env, { listener: true });
    const stranger = await createUser(env, { listener: true });
    assert.equal((await env.api(contact, "GET", `/api/users/${speaker}/mini-profile`)).status, 404);
    await env.api(speaker, "POST", "/api/invites", { listenerId: contact });
    assert.equal((await env.api(contact, "GET", `/api/users/${speaker}/mini-profile`)).status, 200);
    assert.equal((await env.api(stranger, "GET", `/api/users/${speaker}/mini-profile`)).status, 404);
    const otherSpeaker = await createUser(env);
    assert.equal((await env.api(otherSpeaker, "GET", `/api/users/${speaker}/mini-profile`)).status, 404);
  });
});

describe("kutish navbati", () => {
  it("onlayn dardkash yo'q bo'lsa 404, navbatni parallel bosishda faqat bittasi oladi", async () => {
    await env.q("UPDATE listener_profiles SET is_online = false");
    const speaker = await createUser(env);
    assert.equal((await env.api(speaker, "POST", "/api/session/match")).status, 404);
    const joined = await env.api(speaker, "POST", "/api/waitlist");
    const waitId = joined.body.waiting.id;
    const a = await createUser(env, { listener: true });
    const b = await createUser(env, { listener: true });
    const [r1, r2] = await Promise.all([
      env.api(a, "POST", `/api/waitlist/${waitId}/take`),
      env.api(b, "POST", `/api/waitlist/${waitId}/take`),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  });
});

describe("yozishmalar", () => {
  it("qo'ng'iroqsiz xabar: o'qilmaganlar soni, o'qilganda nol", async () => {
    const speaker = await createUser(env);
    const listener = await createUser(env, { listener: true });
    const started = await env.api(speaker, "POST", "/api/conversations", { listenerId: listener, message: "Salom" });
    assert.equal(started.status, 200);
    assert.equal((await env.api(listener, "GET", "/api/unread")).body.chats, 1);
    await env.api(listener, "POST", `/api/conversations/${started.body.sessionId}/read`);
    assert.equal((await env.api(listener, "GET", "/api/unread")).body.chats, 0);
  });

  it("yozishmasi bor suhbat 24 soatda yopilmaydi, xabarsiz taklif yopiladi", async () => {
    const speaker = await createUser(env);
    const listener = await createUser(env, { listener: true });
    const withChat = (await env.api(speaker, "POST", "/api/conversations", { listenerId: listener, message: "Salom" })).body.sessionId;
    const other = await createUser(env, { listener: true });
    const bare = (await env.api(speaker, "POST", "/api/invites", { listenerId: other })).body.sessionId;
    await env.q("UPDATE sessions SET created_at = now() - interval '30 hours' WHERE id = ANY($1)", [[withChat, bare]]);
    // Sweeper har daqiqada ishlaydi — kutamiz.
    let bareStatus;
    for (let i = 0; i < 70; i++) {
      bareStatus = (await env.q("SELECT status FROM sessions WHERE id = $1", [bare])).rows[0].status;
      if (bareStatus !== "scheduled") break;
      await sleep(1000);
    }
    assert.equal(bareStatus, "cancelled");
    assert.equal((await env.q("SELECT status FROM sessions WHERE id = $1", [withChat])).rows[0].status, "scheduled");
  });
});

describe("xatlar", () => {
  it("birinchi xat moderatsiyada, admin tasdiqlagach ochiladi; spam — 14 kun cheklov", async () => {
    const author = await createUser(env);
    const listener = await createUser(env, { listener: true });
    const created = await env.api(author, "POST", "/api/letters", { body: "Birinchi xatim" });
    assert.equal(created.body.pending, true);
    const id = created.body.letterId;
    const cb = (from, data) =>
      env.webhook({ callback_query: { id: "cb", from: { id: from }, data, message: { chat: { id: from }, message_id: 1, text: "x" } } });
    await cb(12345, `letter_ok:${id}`);
    assert.equal((await env.q("SELECT status FROM letters WHERE id = $1", [id])).rows[0].status, "pending");
    await cb(Number(env.adminChat), `letter_ok:${id}`);
    assert.equal((await env.q("SELECT status FROM letters WHERE id = $1", [id])).rows[0].status, "open");
    assert.equal((await env.api(listener, "POST", `/api/letters/${id}/flag`)).status, 200);
    await cb(Number(env.adminChat), `letter_spam:${id}`);
    assert.equal((await env.api(author, "POST", "/api/letters", { body: "yana" })).body.code, "letters_blocked");
  });
});

describe("Telegram", () => {
  it("boshqa hisobga bog'langan Telegram tasdiq bilan ko'chiriladi", async () => {
    const old = await createUser(env, { telegramOnly: true, telegramId: "900100", listener: true, nickname: "EskiTg" });
    const fresh = await createUser(env, { nickname: "YangiGoogle" });
    const link = await env.api(fresh, "POST", "/api/telegram/link");
    const token = new URL(link.body.url).searchParams.get("start");
    await env.webhook({ message: { message_id: 1, text: `/start ${token}`, chat: { id: 900100, type: "private" }, from: { id: 900100 } } });
    const ask = env.telegramSent().filter((m) => String(m.body.chat_id) === "900100").pop();
    assert.match(ask.body.text, /EskiTg/);
    await env.webhook({ callback_query: { id: "cb", from: { id: 900100 }, data: "tg_move_yes", message: { chat: { id: 900100 }, message_id: 5, text: "x" } } });
    assert.equal((await env.q("SELECT telegram_id FROM users WHERE id = $1", [fresh])).rows[0].telegram_id, "900100");
    const oldRow = (await env.q("SELECT telegram_id, banned_at FROM users WHERE id = $1", [old])).rows[0];
    assert.equal(oldRow.telegram_id, null);
    assert.ok(oldRow.banned_at);
  });

  it("tasdiq xabari yo'riqnoma va ilova tugmasi bilan boradi", async () => {
    const applicant = await createUser(env, { telegramId: "900200", listener: "pending", nickname: "Arizachi" });
    const admin = await createUser(env, { role: "admin", nickname: "Admin" });
    assert.equal((await env.api(admin, "POST", `/api/admin/listeners/${applicant}/approve`)).status, 200);
    await sleep(200);
    const msg = env.telegramSent().filter((m) => String(m.body.chat_id) === "900200").pop();
    assert.match(msg.body.text, /Tabriklaymiz/);
    assert.ok(msg.body.reply_markup.inline_keyboard[0][0].web_app);
  });
});
