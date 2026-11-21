const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) map[JSON.parse(`"${m[1]}"`).replace(/\uFE0F/g, "")] ||= m[2];
}

// brakujace -> najblizszy odpowiednik z paczki
const alias = {
	"🛍": "📦", "📨": "📤", "📩": "📤", "📱": "📞", "📋": "📄",
	"✖": "❌", "⛔": "🚫", "💳": "💰", "🔢": "🔣", "⚠": "❗️",
	"🔐": "🔒", "🔑": "🔒", "🔓": "🔒",
};

const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

c = c.replace(/<tg-emoji emoji-id=\\?"(\d+)\\?">([\s\S]*?)<\/tg-emoji>(\uFE0F)?/g, (full, oldId, inner, vs) => {
	const raw = (inner + (vs || "")).trim();
	const ch = raw.replace(/\uFE0F/g, "");
	const id = map[ch] || map[alias[ch]] || map[alias[ch.replace(/\uFE0F/g, "")]];
	if (!id) return raw; // zostaw goly znak
	return `<tg-emoji emoji-id=\\"${id}\\">${raw.replace(/\uFE0F/g, "")}</tg-emoji>`;
});

fs.writeFileSync(p, c);

const left = [...c.matchAll(/<tg-emoji emoji-id=\\?"(\d+)\\?">([^<]*)<\/tg-emoji>/g)];
const oldIds = new Set(["5271993882492559766", "5269274438049752598", "5271666760603427350", "5271792289612588924", "5271790979647564149", "5272019892814504151", "5271721242263577490", "5269769531814865334", "5271588587903674739", "5271470051101272581", "5271710728183637588", "5271811883253391120", "5269500757056449381", "5271540707608258213", "5271918596010828714", "5271882758803713012", "5271704307207528291"]);
const still = left.filter(m => oldIds.has(m[1]));
console.log("tagow lacznie:", left.length, "starych:", still.length);
