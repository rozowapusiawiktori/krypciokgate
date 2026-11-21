const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const pairs = [
	['let caption = `📃 Twoje oferty`;', 'let caption = `📋 *Twoje oferty*`;'],
	['let caption = `📃 Allegro lokalnie`;', 'let caption = `📋 *Allegro Lokalnie*`;'],
	['`✏️ *Edytujesz ofertę:*\\n\\n`', '`✏️ *Edytujesz ofertę*\\n\\n`'],
	['text: "❌ Usuń wszystkie oferty"', 'text: "🧹 Usuń wszystkie oferty"'],
	['text: "❌ Usuń wszystkie"', 'text: "🧹 Usuń wszystkie"'],
	['text: `📦 ${offer.nazwa}`', 'text: `🛍 ${offer.nazwa}`'],
];
for (const [a, b] of pairs) {
	const before = c;
	c = c.split(a).join(b);
	console.log(before === c ? "BRAK" : "ok", a.slice(0, 42));
}
fs.writeFileSync(p, c);
