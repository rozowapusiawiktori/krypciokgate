const fs = require("fs");
const p = "bot.js";
let s = fs.readFileSync(p, "utf8");
const lines = s.split("\n").filter(l =>
	!l.includes('query.data.startsWith("olx_edit_fee_")') &&
	!l.includes('query.data.startsWith("vinted_edit_fee_")')
);
fs.writeFileSync(p, lines.join("\n"));
console.log("ok");
