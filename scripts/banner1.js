const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

// 1) w sendPaymentGatewaysMenu: podmien banita.png na bramka.png oraz wymus editMessageMedia
let inFn = false, fnStart = -1;
for (let i = 0; i < lines.length; i++) {
	if (/async function sendPaymentGatewaysMenu/.test(lines[i])) { inFn = true; fnStart = i; }
	if (inFn && /^}/.test(lines[i]) && i > fnStart) {
		// koniec funkcji
		for (let k = fnStart; k <= i; k++) {
			lines[k] = lines[k]
				.replace(/"attach:\/\/banita\.png"/g, '"attach://bramka.png"')
				.replace(/sendPhoto\(chatId, "banita\.png"/g, 'sendPhoto(chatId, "bramka.png"');
		}
		inFn = false;
	}
}
fs.writeFileSync(p, lines.join("\n"));
console.log("gateway menu -> bramka.png");
