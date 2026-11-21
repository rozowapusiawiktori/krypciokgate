const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) map[JSON.parse(`"${m[1]}"`).replace(/\uFE0F/g, "")] ||= m[2];
}
const alias = {
	"🚚": "📦", "🔙": "↩️", "🧹": "🗑", "💸": "💰", "🏦": "🏧", "🔢": "🔣",
	"🌍": "🌐", "📲": "📞", "💳": "💰", "♻️": "🔄", "♻": "🔄", "➖": "⬇️",
	"⚠️": "❗️", "⚠": "❗️", "🗑️": "🗑", "🎟️": "🎟", "🛡️": "🛡", "🛡": "🛡",
	"📋": "📄", "🗂": "📁", "📃": "📄", "🕐": "🕓", "🏙": "📍", "🏟": "📍",
	"💺": "📌", "🪑": "📌", "🏢": "💼", "📸": "📷", "🖥": "📺", "🧾": "📄",
	"🛍": "📦", "🛍️": "📦", "📱": "📞", "🔑": "🔒", "🔐": "🔒", "✖": "❌",
	"⛔": "🚫", "🔓": "🔒", "💵": "💰", "📨": "📤", "📩": "📤",
};
const lookup = (ch) => {
	const k = ch.replace(/\uFE0F/g, "");
	const a = alias[k];
	return map[k] || (a ? map[a.replace(/\uFE0F/g, "")] : null) || null;
};
const PLATFORM_ICON = { olx: "🔣", allegrolokalnie: "🅰", vinted: "👕", ticketmaster: "🎤", alebilet: "🎟" };

const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
let done = 0;
const skipped = [];

// dopasuj: text: "..." (z escapami) albo '...' , po czym ", callback_data"
const re = /text:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*(callback_data)/g;

c = c.replace(re, (full, quoted, cb) => {
	const q = quoted[0];
	let body = quoted.slice(1, -1);

	let emoji = null;
	const tag = /<tg-emoji emoji-id=\\?"\d+\\?">([^<]*)<\/tg-emoji>\uFE0F?/.exec(body);
	const pe = /\$\{pe\("\w+",\s*"([^"]*)"\)\}\uFE0F?/.exec(body);
	const plat = /\$\{GATEWAY_PLATFORMS\.(\w+)\.emoji\}/.exec(body);
	const raw = /([\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]\uFE0F?)/u.exec(body);

	if (tag) { emoji = tag[1]; body = body.replace(tag[0], ""); }
	else if (pe) { emoji = pe[1]; body = body.replace(pe[0], ""); }
	else if (plat) { emoji = PLATFORM_ICON[plat[1]] || "📦"; body = body.replace(plat[0], ""); }
	else if (raw) { emoji = raw[1]; body = body.replace(raw[1], ""); }

	if (!emoji) { skipped.push(body); return full; }
	const id = lookup(emoji);
	if (!id) { skipped.push(body + " [" + emoji + "]"); return full; }

	body = body.replace(/^\s+/, "").replace(/\s+$/, "");
	done++;
	return `text: ${q}${body}${q}, icon_custom_emoji_id: "${id}", ${cb}`;
});

fs.writeFileSync(p, c);
console.log("przepisane:", done);
console.log("pominiete:", [...new Set(skipped)].join(" | ") || "brak");
