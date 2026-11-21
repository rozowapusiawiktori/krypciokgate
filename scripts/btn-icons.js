const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) map[JSON.parse(`"${m[1]}"`).replace(/\uFE0F/g, "")] ||= m[2];
}

// brakujace -> najblizszy sensowny odpowiednik z paczki
const alias = {
	"🚚": "📦", "🔙": "↩️", "🧹": "🗑", "💸": "💰", "🏦": "🏧", "🔢": "🔣",
	"🌍": "🌐", "📲": "📞", "💳": "💰", "♻️": "🔄", "➖": "⬇️", "⚠️": "❗️",
	"🗑️": "🗑", "🎟️": "🎟", "🎯": "🎯", "🛡": "🛡", "🛡️": "🛡", "🔁": "🔁",
	"📋": "📄", "🗂": "📁", "📃": "📄", "🕐": "🕓", "🏙": "📍", "🏟": "📍",
	"💺": "📌", "🪑": "📌", "🏢": "💼", "📸": "📷", "🖥": "📺", "🧾": "📄",
};

const PE_KEYS = {
	send: "📤", apple: "🍏", star: "⭐️", sparkle: "✨", calstar: "📅", cmd: "⌨",
	box: "📦", gearO: "🔧", gear: "⚙️", gearA: "🔨", gearHD: "📊", gearSD: "📈",
	gearFHD: "📈", sliders: "🎛", slidersV: "🎛", quotes: "📝", quoteX: "❌",
};

const lookup = (ch) => map[ch] || map[alias[ch]] || null;

const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let done = 0, skipped = [];

const out = lines.map((line) => {
	if (!/callback_data/.test(line)) return line;
	const m = /^(\s*\{?\s*text:\s*)(["'`])([\s\S]*?)\2(\s*,\s*callback_data[\s\S]*)$/.exec(line);
	if (!m) return line;
	const head = m[1], q = m[2];
	let body = m[3], tail = m[4];
	if (/icon_custom_emoji_id/.test(line)) return line;

	let emoji = null;

	// 1) tag <tg-emoji ...>X</tg-emoji>
	const tag = /<tg-emoji emoji-id=\\?"\d+\\?">([\s\S]*?)<\/tg-emoji>/.exec(body);
	if (tag) {
		emoji = tag[1].trim();
		body = body.replace(/<tg-emoji emoji-id=\\?"\d+\\?">[\s\S]*?<\/tg-emoji>\uFE0F?\s*/g, "");
		body = body.replace(/^<tg-emoji emoji-id=\\?"\d+\\?">[\s\S]*?<\/tg-emoji>\uFE0F?/g, "");
	} else {
		// 2) pe("klucz", "fallback")
		const peMatch = /\$\{pe\("(\w+)",\s*"([^"]*)"\)\}/.exec(body);
		if (peMatch) {
			emoji = peMatch[2];
			body = body.replace(/\$\{pe\("\w+",\s*"[^"]*"\)\}\uFE0F?\s*/g, "");
		} else {
			// 3) gołe emoji
			const raw = /([\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]\uFE0F?)/u.exec(body);
			if (raw) {
				emoji = raw[1];
				body = body.replace(raw[1], "");
			}
		}
	}

	body = body.replace(/^\s+/, "").replace(/\s+$/, "");
	if (!emoji) { skipped.push(body); return line; }

	const id = lookup(emoji.replace(/\uFE0F/g, ""));
	if (!id) { skipped.push(body + " [" + emoji + "]"); return line; }

	done++;
	const cleanBody = q === '"' ? body.replace(/"/g, '\\"') : body;
	return `${head}${q}${cleanBody}${q}, icon_custom_emoji_id: "${id}"${tail.replace(/^\s*,\s*/, ", ")}`;
});

fs.writeFileSync(p, out.join("\n"));
console.log("przepisane przyciski:", done);
console.log("pominiete:", [...new Set(skipped)].join(" | ") || "brak");
