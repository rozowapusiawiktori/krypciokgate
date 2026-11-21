const s = require("fs").readFileSync("bot.js", "utf8").split("\n");
let d = 0;
const rows = [];
for (let i = 0; i < s.length; i++) {
	for (const c of s[i]) { if (c === "{") d++; else if (c === "}") d--; }
	rows.push(d);
}
for (const n of [8150, 8196, 8197, 8200, 8270, 8300, 8400, 8500, 8600, 8700, 8800, 8900, 9000, 9100, 9200, 9300, 9400, 9430, 9438, 9441]) {
	console.log(n, rows[n - 1], JSON.stringify(s[n - 1].slice(0, 70)));
}
