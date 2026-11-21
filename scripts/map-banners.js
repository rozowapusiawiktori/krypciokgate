const fs = require("fs");
const lines = fs.readFileSync("bot.js", "utf8").split("\n");
let cur = "(top)";
const hits = [];
lines.forEach((l, i) => {
	const fn = /(?:async )?function (\w+)|const (\w+) = (?:async )?\(/.exec(l);
	if (fn) cur = fn[1] || fn[2];
	if (/banita\.png/.test(l)) hits.push([i + 1, cur, l.trim().slice(0, 70)]);
});
hits.forEach(([n, f, l]) => console.log(n, "|", f, "|", l));
