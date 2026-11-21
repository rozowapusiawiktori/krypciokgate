const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
const found = [];
lines.forEach((l, i) => {
	if (!/text: /.test(l)) return;
	if (/\$\{pe\(/.test(l) || /<tg-emoji/.test(l)) found.push([i + 1, l.trim()]);
});
console.log("pozostale etykiety z pe/tagiem:", found.length);
found.forEach(([n, l]) => console.log(n, l.slice(0, 110)));
