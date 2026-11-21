const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
function endOfTemplate(src, from){
  let depth=0;
  for(let i=from;i<src.length;i++){
    const c=src[i];
    if(c==="\\"){ i++; continue; }
    if(depth===0){
      if(c==="$"&&src[i+1]==="{"){depth=1;i++;continue;}
      if(c==="`") return i;
    } else {
      if(c==="{")depth++;
      else if(c==="}")depth--;
      else if(c==="`"){ const e=endOfTemplate(src,i+1); if(e<0)return -1; i=e; }
      else if(c==="'"||c==='"'){const q=c;i++;while(i<src.length&&src[i]!==q){if(src[i]==="\\")i++;i++;}}
    }
  }
  return -1;
}
function skipWs(src,i){ while(i<src.length && /[ \t\r\n]/.test(src[i])) i++; return i; }

let fixed=0;
// iteruj po naglowkach bez domkniecia: "…<b>T</b>\n\n<blockquote>`" i brak "</blockquote>" w calym wyrazeniu
let guard=0;
while(guard++<400){
  const m=/<blockquote>`/g.exec(s.slice(fixed));
  if(!m) break;
  const idx = fixed + m.index;
  // koniec calej konkatenacji
  let k = idx + "<blockquote>`".length - 1; // pozycja ostatniego backticka
  let last = k;
  while(true){
    const n2 = skipWs(s, last+1);
    if(s[n2] === "+"){
      const n3 = skipWs(s, n2+1);
      if(s[n3] === "`"){ last = endOfTemplate(s, n3+1); if(last<0) break; continue; }
    }
    break;
  }
  if(last < 0 || !/`/.test(s[last])) { fixed = idx+1; continue; }
  // policz czy blok ma domkniecie
  const seg = s.slice(idx, last);
  fixed = last+1;
  if(seg.includes("</blockquote>")) continue;
  s = s.slice(0,last) + "</blockquote>" + s.slice(last);
  fixed += "</blockquote>".length;
  fixed++; // przesun dalej
  fixed = Math.min(fixed, s.length);
  // restart od tego miejsca (z ochrona)
  if(fixed>s.length) break;
  // przesun okno
  const seg2 = s.slice(fixed);
  const m2 = /<blockquote>`/.exec(seg2);
  // petla i tak od nowa skanuje od fixed - ustaw indeks globalny przez przesuniecie
  // (uproszczenie: kontynuujemy petle, ale exec liczy od fixed)
  fixed = fixed; 
  // recznie przelicz: nastepne wywolanie exec na s.slice(fixed)
  // -> juz jest handled
  // ale nasz while uzywa stale s.slice(fixed) wiec ok
  continue;
}
fs.writeFileSync("bot.js",s);
console.log("open:",(s.match(/<blockquote>/g)||[]).length,"close:",(s.match(/<\/blockquote>/g)||[]).length);
