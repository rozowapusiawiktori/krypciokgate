const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
for(let i=0;i<L.length;i++){
  if(/parse_mode:\s*"Markdown"/.test(L[i])){
    const win=L.slice(Math.max(0,i-12), i+3).join("\n");
    const html=/<b>|<code>|<tg-emoji|<blockquote>/.test(win);
    console.log((i+1)+(html?" [HTML!] ":"  ")+L[i].trim().slice(0,80));
  }
}
