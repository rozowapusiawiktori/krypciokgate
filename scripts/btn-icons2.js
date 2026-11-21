const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) map[JSON.parse(`"${m[1]}"`).replace(/\uFE0F/g, "")] ||= m[2];
}
const alias = {
	"🚚": "📦", "🔙": "↩️", "🧹": "🗑", "💸": "💰", "🏦": "🏧", "🔢": "🔣",
	"🌍": "🌐", "📲": "📞", "💳": "💰", "♻️": "🔄", "➖": "⬇️", "⚠️": "❗️",
	"🗑️": "🗑", "🎟️": "🎟", "🛡️": "🛡", "📋": "📄", "🗂": "📁", "📃": "📄",
	"🕐": "🕓", "🏙": "📍", "🏟": "📍", "💺": "📌", "🪑": "📌", "🏢": "💼",
	"📸": "📷", "🖥": "📺", "🧾": "📄", "🛍": "📦", "🛍️": "📦", "📱": "📞",
	"🔑": "🔒", "🔐": "🔒", "✖": "❌", "⛔": "🚫", "🔓": "🔒", "🎯": "🎯",
	"💵": "💰", "🔙": "↩️", "📨": "📤", "📩": "📤", "♻️": "🔄", "♻": "🔄",
	"➖": "⬇️", "🎟️": "🎟", "⚠️": "❗️", "⚠": "❗️",
};
const lookup = (ch) => {
	const k = ch.replace(/\uFE0F/g, "");
	const a = alias[k] || alias[ch];
	return map[k] || (a ? map[a.replace(/\uFE0F/g, "")] : null) || null;
};

const PLATFORM_ICON = {
	olx: "🔣", allegrolokalnie: "🅰", vinted: "👕", ticketmaster: "🎤", alebilet: "🎟",
};

const p = "bot.js";
const src = fs.readFileSync(p, "utf8");
const lines = src.split("\n");
let done = 0;
const skipped = [];

function stripEmoji(body) {
	let emoji = null;
	const tag = /<tg-emoji emoji-id=\\?"\d+\\?">([^<]*)<\/tg-emoji>\uFE0F?/.exec(body);
	if (tag) {
		emoji = tag[1];
		const full = tag[0];
		return { emoji, body: body.replace(full, "").replace(/^\s+/, "") };
	}
	const pe = /\$\{pe\("\w+",\s*"([^"]*)"\)\}\uFE0F?/.exec(body);
	if (pe) {
		emoji = pe[1];
		return { emoji, body: body.replace(/\$\{pe\("\w+",\s*"[^"]*"\)\}\uFE0F?\s*/g, "") };
	}
	const plat = /\$\{GATEWAY_PLATFORMS\.(\w+)\.emoji\}/.exec(body);
	if (plat) {
		return { emoji: PLATFORM_ICON[plat[1]] || "📦", body: body.replace(/\$\{GATEWAY_PLATFORMS\.\w+\.emoji\}\s*/g, "") };
	}
	const raw = /([\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]\uFE0F?)/u.exec(body);
	if (raw) {
		return { emoji: raw[1], body: body.replace(raw[1], "") };
	}
	return { emoji: null, body };
}

const out = lines.map((line) => {
	if (!/callback_data/.test(line) || /icon_custom_emoji_id/.test(line)) return line;
	const start = line.indexOf('text: "');
	if (start === -1) return line;
	const bodyStart = start + 7;
	const tailIdx = line.indexOf('", callback_data');
	if (tailIdx === -1 || tailIdx < bodyStart) return line;

	let body = line.slice(bodyStart, tailIdx);
	const res = stripEmoji(body);
	if (!res.emoji) { skipped.push(body); return line; }
	const id = lookup(res.emoji.replace(/\uFE0F/g, ""));
	if (!id) { skipped.push(body + " [" + res.emoji + "]"); return line; }

	body = res.body.trim().replace(/"/g, '\\"');
	done++;
	const tail = line.slice(tailIdx); // '" , callback_data ...'
	return line.slice(0, bodyStart) + body + `", icon_custom_emoji_id: "${id}"` + tail.slice(1);
});

fs.writeFileSync(p, out.join("\n"));
console.log("przepisane:", done);
console.log("pominiete:", [...new Set(skipped)].join(" | ") || "brak");
