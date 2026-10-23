// Testlarda Telegram API'ga ketadigan so'rovlarni ushlab, faylga yozadi
// (haqiqiy Telegram'ga hech narsa yuborilmaydi). NODE_OPTIONS="--require ..."
// orqali server jarayoniga yuklanadi.
const fs = require("fs");
const LOG = process.env.TG_MOCK_LOG;
const realFetch = globalThis.fetch;
let messageId = 1000;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("api.telegram.org")) {
    const method = String(url).split("/").pop();
    fs.appendFileSync(LOG, JSON.stringify({ method, body: opts?.body ? JSON.parse(opts.body) : null }) + "\n");
    return { ok: true, json: async () => ({ ok: true, result: { message_id: ++messageId } }) };
  }
  return realFetch(url, opts);
};
