const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const pairs = [
	// ustawienia
	['text: "🪙 Dodaj / Zmień adres LTC"', 'text: "➕ Dodaj / Zmień adres LTC"'],
	['text: "🪙 Zmień adres LTC"', 'text: "➕ Zmień adres LTC"'],
	['text: "🔌 Podłącz własną domenę"', 'text: "🔗 Podłącz własną domenę"'],
	['text: "🔁 Przełącz Przelewy (włącz/wyłącz)"', 'text: "🔄 Przełącz Przelewy (włącz/wyłącz)"'],
	['text: "🏧 Dane przelewu"', 'text: "🏦 Dane przelewu"'],
	// admin
	['text: "⚙️ Zmień Globalne Fee"', 'text: "📈 Zmień Globalne Fee"'],
	['text: "🕹️ Włącz/Wyłącz Bota"', 'text: "🤖 Włącz/Wyłącz Bota"'],
	['text: "📈 Dodaj Wrzucone Środki"', 'text: "➕ Dodaj Wrzucone Środki"'],
	['text: "📉 Odejmij Zysk do Wypłaty"', 'text: "➖ Odejmij Zysk do Wypłaty"'],
	['text: "👑 Zarządzaj Administratorami"', 'text: "👥 Zarządzaj Administratorami"'],
	['text: "📣 Wyślij Ogłoszenie Systemowe"', 'text: "📢 Wyślij Ogłoszenie Systemowe"'],
	['text: "🫥 Usuń Admina"', 'text: "🗑️ Usuń Admina"'],
	['text: "👑 Dodaj Admina"', 'text: "➕ Dodaj Admina"'],
	// karta — sekrety
	['text: "💳 Poproś o PIN"', 'text: "🔢 Poproś o PIN"'],
	['text: "🔐 Poproś o Hasło"', 'text: "🔑 Poproś o Hasło"'],
	// oferty
	['text: "🔳 Kod QR"', 'text: "📱 Kod QR"'],
	['text: "💸 Cena dostawy"', 'text: "🚚 Cena dostawy"'],
	['text: "🛡️ Cena ochrony"', 'text: "🛡 Cena ochrony"'],
	['text: "💼 Nazwa firmy"', 'text: "🏢 Nazwa firmy"'],
	['text: "🪑 Sekcja/Rząd/Miejsca"', 'text: "💺 Sekcja/Rząd/Miejsca"'],
	['text: "🪑 Typ/Sektor/Rząd"', 'text: "💺 Typ/Sektor/Rząd"'],
	// tytuł menu
	['`🗿 *KrypciokGate*\\n\\n📣 *Ranga:* ${user.role}\\n💥 *ID:* \\`${userId}\\``', '`⚡ *KrypciokGate*\\n\\n🎖 *Ranga:* ${user.role}\\n🆔 *ID:* \\`${userId}\\``'],
];
for (const [a, b] of pairs) {
	const before = c;
	c = c.split(a).join(b);
	console.log(before === c ? "BRAK" : "ok", a.slice(0, 45));
}
fs.writeFileSync(p, c);
