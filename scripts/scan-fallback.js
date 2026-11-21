const fs = require("fs");
const c = fs.readFileSync("bot.js", "utf8");
// fallback musi byc prawdziwym emoji: znajdz znaki niebedace emoji
const re = /<tg-emoji emoji-id=\\?"(\d+)\\?">([^<]*)<\/tg-emoji>/g;
const bad = new Map();
let m;
while ((m = re.exec(c))) {
	const ch = m[2].trim();
	if (!ch) { bad.set("(pusty)", (bad.get("(pusty)") || 0) + 1); continue; }
	// dozwolone: piktogramy
	if (!/[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u.test(ch)) {
		bad.set(ch + " (U+" + ch.codePointAt(0).toString(16) + ")", (bad.get(ch) || 0) + 1);
	}
}
console.log([...bad.entries()].map(([k, v]) => k + "×" + v).join("\n") || "brak podejrzanych");
