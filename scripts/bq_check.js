const fs=require("fs");
const s=fs.readFileSync("bot.js","utf8");
let pos=0, n=0, bad=[];
while(true){
  const i=s.indexOf("<blockquote>", pos);
  if(i<0) break;
  const j=s.indexOf("</blockquote>", i);
  if(j<0){ bad.push("brak domkniecia od "+i); break; }
  const inner=s.slice(i+12,j);
  if(inner.includes("<blockquote>")) bad.push("zagniezdzony @"+i);
  // koniec literalu miedzy i a j?
  if(inner.includes("` +")||inner.includes("`+")) bad.push("literal zamkniety w srodku @"+i);
  pos=j+13; n++;
}
console.log("par:",n); bad.slice(0,10).forEach(b=>console.log(b));
