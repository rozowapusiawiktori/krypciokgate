const fs = require("fs");
const lines = fs.readFileSync("bot.js", "utf8").split("\n");
let tagged = 0, raw = 0;
const raws = new Map();
lines.forEach((l, i) => {
	const m = /text:\s*(["'`])([\s\S]*?)\1/.exec(l);
	if (!m || !/callback_data/.test(l)) return;
	const body = m[2];
	if (body.includes("<tg-emoji")) { tagged++; return; }
	const em = body.match(/[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F300}-\u{1FAFF}]\uFE0F?/gu);
	if (em) { raw++; em.forEach(e => raws.set(e, (raws.get(e) || 0) + 1)); }
});
console.log("etykiety z tagiem:", tagged);
console.log("etykiety z gołym emoji:", raw);
console.log("gołe emoji w etykietach:", [...raws.entries()].map(([e, c]) => e + "×" + c).join(" "));
