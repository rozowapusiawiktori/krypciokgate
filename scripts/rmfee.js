const fs = require("fs");
const p = "bot.js";
let lines = fs.readFileSync(p, "utf8").split("\n");
const targets = [];
lines.forEach((l, i) => {
	if (/^\s*oplata: String,$/.test(l)) targets.push(i + 1);
});
// zostaw tylko te, ktore sa tuz po "cena: String," (ticketmaster + alebilet)
const keep = [];
for (const n of targets) {
	const prev = lines[n - 2] || "";
	if (/cena: String,/.test(prev)) keep.push(n);
}
const indices = new Set();
targets.forEach((n, k) => { if (!keep.includes(n)) indices.add(n - 1); });
lines = lines.filter((l, i) => !indices.has(i));
fs.writeFileSync(p, lines.join("\n"));
console.log("usuniete pola oplata:", [...indices].map(i => i + 1).join(","));
