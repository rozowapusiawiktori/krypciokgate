const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// naglowek: <blockquote>EMOJI <b>T</b>\n</blockquote>  ->  EMOJI <b>T</b>\n\n<blockquote>
const re=/<blockquote>(<tg-emoji emoji-id=\\"[0-9]+\\">[^<]*<\/tg-emoji> <b>[^<]+<\/b>)\\n<\/blockquote>/g;
let n=0;
s=s.replace(re,(m,head)=>{ n++; return `${head}\\n\\n<blockquote>`; });
fs.writeFileSync("bot.js",s);
console.log("przebudowane naglowki:",n);
console.log("open:",(s.match(/<blockquote>/g)||[]).length,"close:",(s.match(/<\/blockquote>/g)||[]).length);
