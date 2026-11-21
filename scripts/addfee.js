const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
const targets = [5806, 5938, 6063, 7055, 7193];
let out = [];
for (let i = 0; i < lines.length; i++) {
	out.push(lines[i]);
	const n = i + 1;
	if (targets.includes(n)) {
		const indent = (lines[i].match(/^\s*/) || [""])[0];
		out.push(indent + "`🧾 Opłata serwisowa: \\`${offer.oplata != null && offer.oplata !== \"\" ? `${offer.oplata} zł` : \"auto (15%)\"}\\`\\n` +");
	}
}
fs.writeFileSync(p, out.join("\n"));
console.log("done");
