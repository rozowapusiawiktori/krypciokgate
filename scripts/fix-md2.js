const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
// editMessageMedia z captionem zawierajacym tg-emoji -> HTML
c = c.replace(/(bot\.editMessageMedia\(\{\s*\n\s*)parse_mode: "Markdown",(\s*\n\s*type: "photo",\s*\n\s*media: [^\n]*\n\s*caption: `[^`]*tg-emoji)/g,
	'$1parse_mode: "HTML",$2');
fs.writeFileSync(p, c);
console.log("zamienione editMessageMedia:", (c.match(/editMessageMedia\(\{\s*\n\s*parse_mode: "HTML"/g) || []).length);
