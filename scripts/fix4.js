const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const before = c.length;
c = c.split('\\", callback_data').join('", callback_data');
fs.writeFileSync(p, c);
console.log("naprawiono ogonkow:", before - c.length);
