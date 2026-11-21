const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
for(let i=0;i<L.length;i++){
  if(/parse_mode:\s*"HTML"/.test(L[i])){
    // caption = w tym samym lub poprzednim bloku
    let j=i-1, expr="";
    while(j>=0 && j>i-25){
      if(/^\s*[`"]/.test(L[j]) || /caption:/.test(L[j]) || /const .*=/.test(L[j])) expr = L[j] + "\n" + expr;
      if(/caption:/.test(L[j]) || /const .*=/.test(L[j])) break;
      j--;
    }
    const ctx = L.slice(Math.max(0,i-6),i+3).join("\n");
    if(/<b>|<code>|<tg-emoji|<blockquote>/.test(ctx) && /caption|text/.test(ctx)){
      if(!/mdToHtml|markdownToHtml/.test(ctx)) console.log("L"+(i+1)+" | "+L[i].trim().slice(0,60));
    }
  }
}
