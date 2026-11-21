const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// "undefined" -> prawidłowe ID
s=s.replace(/emoji-id="undefined">📝/g,'emoji-id="5920046907782074235">📝');
s=s.replace(/emoji-id="undefined">⚠️/g,'emoji-id="5938215362473496448">⚠️');
fs.writeFileSync("bot.js",s);
