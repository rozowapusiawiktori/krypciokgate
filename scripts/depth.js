const s = require("fs").readFileSync("bot.js", "utf8").split("\n");
let d = 0;
const rows = [];
for (let i = 0; i < s.length; i++) {
	for (const c of s[i]) { if (c === "{") d++; else if (c === "}") d--; }
	rows.push(d);
}
for (let i = 7000; i < 7820; i++) {
	if (rows[i] > rows[i - 1]) console.log(i + 1, rows[i - 1], "->", rows[i], JSON.stringify(s[i].slice(0, 90)));
}
