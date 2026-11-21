const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
// znajdz bloki caption z gwiazdkami bez konwersji
for(let i=0;i<L.length;i++){
  const l=L[i];
  if(/^\s*`(› |❖ |────)/.test(l) || /caption = `/.test(l)){
    if(/\*[A-Za-zĄĆĘŁŃÓŚŹŻ]/.test(l)){
      const win=L.slice(i,i+14).join("\n");
      if(/<code>|<b>/.test(win) && !/markdownToHtml/.test(win)) console.log("L"+(i+1));
    }
  }
}
