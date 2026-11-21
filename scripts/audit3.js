const fs=require("fs");
const lines=fs.readFileSync("bot.js","utf8").split("\n");
let hits=0;
for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(/bot\.(sendMessage|editMessageText|editMessageCaption)\(/.test(l)){
    const win=lines.slice(i,i+12).join("\n");
    if(!/markdownToHtml/.test(win) && /\*\*|`/.test(win)){
      // sprawdz czy w bloku jest html
      const hasHtml=/<b>|<code>|<tg-emoji/.test(win);
      if(!hasHtml){ console.log("L"+(i+1)+": "+l.trim().slice(0,100)); hits++; }
    }
  }
}
console.log("podejrzanych:",hits);
