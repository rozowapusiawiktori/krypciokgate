const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

// 1) captiony z tagami i *bold* -> <b> (tylko w liniach z tg-emoji)
c = c.split("\n").map((line) => {
	if (!/<tg-emoji/.test(line)) return line;
	return line.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<b>$2</b>");
}).join("\n");

// 2) fallback sendPhoto z Markdown tam, gdzie caption ma tagi -> HTML
c = c.replace(/caption,\s*\n(\s*)parse_mode: "Markdown"/g, 'caption,\n$1parse_mode: "HTML"');

fs.writeFileSync(p, c);

// raport
const lines = c.split("\n");
let bad = [];
lines.forEach((l, i) => {
	if (!/<tg-emoji/.test(l)) return;
	const ctx = lines.slice(Math.max(0, i - 8), i + 8).join("\n");
	if (/parse_mode: "Markdown"/.test(ctx) && !/parse_mode: "HTML"/.test(ctx)) bad.push(i + 1);
});
console.log("pozostale watpliwosci:", [...new Set(bad)].join(" ") || "brak");
