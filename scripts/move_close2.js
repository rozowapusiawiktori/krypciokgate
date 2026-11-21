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
      if(c==="{") depth=1;
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

let moved=0, guard=0;
while(guard++<400){
  const m=/<\/blockquote>`/g.exec(s);
  if(!m) break;
  const closeEnd = m.index + m[0].length;
  let j = skipWs(s, closeEnd);
  let chained=false;
  // sprawdz czy po tym literalu jest "+ `"
  if(s[j]==="+"){
    const j2 = skipWs(s, j+1);
    if(s[j2]==="`") chained=true;
  }
  if(!chained){
    // przesun wyszukiwanie dalej
    const rest = s.slice(closeEnd);
    const m2 = /<\/blockquote>`/.exec(rest);
    if(!m2) break;
    s = s.slice(0, closeEnd) + s.slice(closeEnd); // bez zmian
    // reczne przesuniecie: oznacz przez podmiane znacznika
    s = s.slice(0, m.index) + "\u0001" + s.slice(m.index+1);
    moved+=0;
    continue;
  }
  // znajdz koniec calej konkatenacji
  let last = -1, k = j;
  while(true){
    const e = endOfTemplate(s, skipWs(s,k+1));
    if(e<0) break;
    last = e;
    const n2 = skipWs(s, e+1);
    if(s[n2]==="+"){ const n3=skipWs(s,n2+1); if(s[n3]==="`"){ k=n3; continue; } }
    break;
  }
  if(last<0) break;
  const origLen = m[0].length;
  s = s.slice(0, m.index) + s.slice(m.index+origLen); // usun
  s = s.slice(0, last-origLen) + "</blockquote>" + s.slice(last-origLen);
  moved++;
}
s = s.replace(/\u0001/g, "");
fs.writeFileSync("bot.js",s);
console.log("przeniesione:",moved);
console.log("open:",(s.match(/<blockquote>/g)||[]).length,"close:",(s.match(/<\/blockquote>/g)||[]).length);
