const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

const repl = [
	// promo kod -> bilet/ticket
	['{ text: "🎟️ Wygeneruj Promo Kod (self cashout)", callback_data: "fg_admin_promo" }',
		'{ text: "Wygeneruj Promo Kod (self cashout)", icon_custom_emoji_id: "6030710030108463274", callback_data: "fg_admin_promo" }'],
];
for (const [a, b] of repl) c = c.split(a).join(b);

// wiek konta -> kalendarz; imie/nazwisko -> osoba
const map = { "🎟️ Wygeneruj": null, "👵 Edytuj wiek konta": ["📅", "5890937706803894250"], "👦 Zmień Imię": ["👤", "6032994772321309200"], "👧 Zmień Nazwisko": ["👤", "6032994772321309200"] };
c = c.split("\n").map((line) => {
	for (const [label, cfg] of Object.entries(map)) {
		if (!cfg) continue;
		if (!line.includes(`"${label}"`)) continue;
		if (line.includes("icon_custom_emoji_id")) continue;
		const ln = line.replace(`"${label}",`, `"${label.replace(/^[^ ]+ /, "")}", icon_custom_emoji_id: "${cfg[1]}",`);
		return ln;
	}
	return line;
}).join("\n");

fs.writeFileSync(p, c);
console.log("ok");
