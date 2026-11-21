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
	"🏠": "🏡", "🚩": "📍", "🗂": "📁", "🖥": "📺", "🖥️": "📺", "🗓️": "📅",
	"🛍️": "📦", "💸": "💰", "💵": "💰", "💲": "💰", "👁": "👁", "📃": "📄",
};

const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
let swapped = 0, miss = new Set();

// tagi moga miec escapowane lub nie cudzyslowy
c = c.replace(/<tg-emoji emoji-id=\\?"\d+\\?">([\s\S]*?)<\/tg-emoji>/g, (full, inner) => {
	const ch = inner.trim().replace(/\uFE0F/g, "");
	const id = map[ch] || map[alias[ch]];
	if (!id) { miss.add(inner.trim()); return full; }
	swapped++;
	return full.replace(/emoji-id=\\?"\d+\\?"/, `emoji-id=\\"${id}\\"`);
});

// surowe emoji w captionach -> tagi (tylko w liniach z backtickiem, poza istniejacymi tagami)
const lines = c.split("\n").map((line) => {
	if (!line.includes("`")) return line;
	const re = /([\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]\uFE0F?)/gu;
	return line.split(/(<tg-emoji[\s\S]*?<\/tg-emoji>)/).map((part) => {
		if (part.startsWith("<tg-emoji")) return part;
		return part.replace(re, (chunk) => {
			const ch = chunk.replace(/\uFE0F/g, "");
			const id = map[ch] || map[alias[ch]];
			if (!id) return chunk;
			return `<tg-emoji emoji-id="${id}">${ch}</tg-emoji>`;
		});
	}).join("");
});

fs.writeFileSync(p, lines.join("\n"));
console.log("tagi zmapowane:", swapped, "| brak:", [...miss].join(" ") || "brak");
