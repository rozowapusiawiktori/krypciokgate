const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "banita.env") });
const T = require("node-telegram-bot-api");
const Bot = T.default || T;
const b = new Bot(process.env.TOKEN);

const boxLines = [
	"<b>Centrum</b>",
	"ID: <code>8806188013</code>",
	"Prowizja: <code>30.0%</code>",
	"",
	"<b>Portfel</b>",
	"Zarobione razem: <code>0.00 PLN</code>",
	"Gotowe do wypłaty: <code>0.00 PLN</code>",
	"",
	"<b>Stan</b>",
	"<code>Online</code> | <b>Limit wpłaty:</b> <code>brak limitu</code>"
];
const caption =
	`<b>Krypciok Gate</b>\n\n` +
	`<blockquote>${boxLines.join("\n")}</blockquote>\n\n` +
	`Wybierz moduł poniżej.`;

b.sendPhoto(process.env.CHANNEL_BACKDOOR, "banita.png", {
	caption,
	parse_mode: "HTML"
}).then(r => { console.log("OK", r.message_id); process.exit(0); })
	.catch(e => { console.log("ERR", e.message); process.exit(1); });
