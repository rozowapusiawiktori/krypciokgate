const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let fixed = 0;
const out = lines.map((line) => {
	if (!line.includes('text: "<tg-emoji')) return line;
	let l = line.replace(/text: "(<tg-emoji emoji-id=)"(\d+)">/, 'text: "$1\\"$2\\">');
	if (l !== line) fixed++;
	return l;
});
fs.writeFileSync(p, out.join("\n"));
console.log("naprawione cytowania:", fixed);
