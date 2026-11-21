const fs = require("fs");

const map = {};
for (const line of fs.readFileSync("scripts/emoji-map.txt", "utf8").split("\n")) {
	const m = /^"(.+?)"\s+(\d+)\s+\d+\s*$/.exec(line.trim());
	if (m) {
		const ch = JSON.parse(`"${m[1]}"`);
		if (!map[ch]) map[ch] = m[2];
	}
}
console.log("mapa rozmiar:", Object.keys(map).length);

const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

let swapped = 0;
const missing = new Set();
c = c.replace(/<tg-emoji emoji-id=\\?"\d+\\?">([\s\S]*?)<\/tg-emoji>/g, (full, inner) => {
	const ch = inner.trim().replace(/\uFE0F/g, "");
	const id = map[ch] || map[ch + "\uFE0F"];
	if (!id) { missing.add(inner.trim()); return full; }
	swapped++;
	return `emoji-id=\\"${id}\\">${inner}</tg-emoji>`;
});

fs.writeFileSync(p, c);
console.log("podmienione tagi:", swapped);
console.log("brak w paczce:", [...missing].join(" ") || "brak");
