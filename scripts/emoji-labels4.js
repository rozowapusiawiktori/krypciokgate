const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const pairs = [
	["`📦 Nazwa:", "`🛍 Nazwa:"],
	["`📝 Opis:", "`📝 Opis:"],
	["`💰 Cena:", "`💵 Cena:"],
	["`💰 Cena przedmiotu:", "`💵 Cena przedmiotu:"],
	["`👤 Sprzedawca:", "`👤 Sprzedawca:"],
	["`🏙 Miasto:", "`📍 Miasto:"],
	["`🏷 Kategoria:", "`🗂 Kategoria:"],
	["`🏷 Tagi:", "`🏷 Tagi:"],
	["`👵 Wiek:", "`👤 Wiek:"],
	["`❓ Ostatnio online:", "`🕒 Ostatnio online:"],
	["`☎️ Numer telefonu:", "`📞 Numer telefonu:"],
	["`📷 Ilość Zdjęć:", "`📸 Ilość zdjęć:"],
	["`📷 *Zdjęcia:", "`📸 *Zdjęcia:"],
	["`🚚 *Cena dostawy:", "`🚚 *Cena dostawy:"],
	["`🛡️ *Cena ochrony:", "`🛡 *Cena ochrony:"],
	["`💼 *Nazwa firmy:", "`🏢 *Nazwa firmy:"],
	["`🛍️ *Kategoria:", "`🗂 *Kategoria:"],
	["`📱 *BLIK:", "`🔢 *BLIK:"],
];
for (const [a, b] of pairs) {
	const before = c;
	c = c.split(a).join(b);
	console.log(before === c ? "BRAK" : "ok", a.slice(0, 34));
}
fs.writeFileSync(p, c);
