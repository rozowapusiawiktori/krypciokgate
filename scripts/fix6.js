const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const before = c;
// pe("x", "<tg-emoji ...>ch</tg-emoji>") -> pe("x", "ch")
c = c.replace(/pe\((\"\w+\"),\s*\"<tg-emoji emoji-id=\\?"\d+\\?">([^<]*)<\/tg-emoji>\"\)/g, 'pe($1, "$2")');
fs.writeFileSync(p, c);
console.log("zmian:", before === c ? 0 : 1);
