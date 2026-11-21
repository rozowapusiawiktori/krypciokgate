const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const pairs = [
	['text: "🗂 Moje oferty"', 'text: "📋 Moje oferty"'],
	['text: "🆕 Dodaj Ofertę"', 'text: "➕ Dodaj ofertę"'],
	['text: "🗃 Twoje oferty"', 'text: "📋 Twoje oferty"'],
	['text: "🆕 Nowa oferta"', 'text: "➕ Nowa oferta"'],
	['text: "📦 KrypciokGate (oferty)"', 'text: "🛍 KrypciokGate (oferty)"'],
	['text: "📝 Złóż podanie"', 'text: "📨 Złóż podanie"'],
	['text: "🔓 Odbanuj Użytkownika"', 'text: "✅ Odbanuj Użytkownika"'],
	['text: "⛔ Zbanuj Użytkownika"', 'text: "🚫 Zbanuj Użytkownika"'],
	['text: "🧾 Ustaw Limit Wpłaty"', 'text: "📥 Ustaw Limit Wpłaty"'],
	// platformy
	["olx: { emoji: '💠'", "olx: { emoji: '🟢'"],
	["allegrolokalnie: { emoji: '🛒'", "allegrolokalnie: { emoji: '🅰️'"],
	["vinted: { emoji: '👗'", "vinted: { emoji: '👕'"],
	["ticketmaster: { emoji: '🎤'", "ticketmaster: { emoji: '🎟'"],
	["alebilet: { emoji: '🎫'", "alebilet: { emoji: '🎫'"],
];
for (const [a, b] of pairs) {
	const before = c;
	c = c.split(a).join(b);
	console.log(before === c ? "BRAK" : "ok", a.slice(0, 45));
}
fs.writeFileSync(p, c);
