const fs = require("fs");
const lines = fs.readFileSync("bot.js", "utf8").split("\n");
const l = lines[4045];
console.log("RAW:", JSON.stringify(l));
// symulacja: wytnij wyrazenie i policz
const m = /text: (`[^`]*`|"[^"]*")/.exec(l);
console.log("WYRAZENIE:", m && JSON.stringify(m[1]));
if (m) {
	const id = "5778672437122045013";
	const body = m[1].slice(1, -1).replace(/\$\{pe\("box", "🏦"\)\}/, `<tg-emoji emoji-id="${id}">🏦</tg-emoji>`);
	console.log("WYNIK:", JSON.stringify(body));
}
