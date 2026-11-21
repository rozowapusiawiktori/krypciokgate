const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) map[JSON.parse(`"${m[1]}"`).replace(/\uFE0F/g, "")] ||= m[2];
}
const alias = {
	"🛍": "📦", "📨": "📤", "📩": "📤", "📱": "📞", "📋": "📄", "✖": "❌",
	"⛔": "🚫", "💳": "💰", "🔢": "🔣", "⚠": "❗️", "🔐": "🔒", "🔑": "🔒",
	"🔓": "🔒", "🕐": "🕓", "🕒": "🕓", "🗓": "📅", "🗿": "🗣", "💠": "🔣",
	"🛡️": "🛡", "🪑": "📌", "💺": "📌", "🏙": "📍", "🏟": "📍", "🎟": "🎫",
	"📲": "📞", "📟": "🔣", "🧾": "📄", "🏢": "💼", "📸": "📷", "🏦": "🏧",
	"🏠": "🏡", "🧩": "🧩", "🚩": "📍",
};

const p = "bot.js";
const raw = fs.readFileSync(p, "utf8");
const lines = raw.split("\n");
let changed = 0;

const out = lines.map((line) => {
	// tylko linie budujace tresc (backtick), bez tagow i bez definicji PE
	if (!line.includes("`") || line.includes("<tg-emoji")) return line;

	const re = /([\u{1F1E6}-\u{1FAFF}\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF]\uFE0F?)/gu;
	let did = false;
	const l = line.replace(re, (full) => {
		const ch = full.replace(/\uFE0F/g, "");
		const id = map[ch] || map[alias[ch]];
		if (!id) return full;
		did = true;
		return `<tg-emoji emoji-id="${id}">${ch}</tg-emoji>`;
	});
	if (did) changed++;
	return l;
});

fs.writeFileSync(p, out.join("\n"));
console.log("linie z emoji:", changed);
