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
      else if(c==="`"){ const e=endOfTemplate(src,i+1); if(e<0) return -1; i=e; }
      else if(c==="'"||c==='"'){const q=c;i++;while(i<src.length&&src[i]!==q){if(src[i]==="\\")i++;i++;}}
    }
  }
  return -1;
}
function skipWs(src,i){ while(i<src.length && /[ \t\r\n]/.test(src[i])) i++; return i; }

let moves=0;
let guard=0;
while(guard++<500){
  const re=/\n<\/blockquote>`/g;
  const m=re.exec(s);
  if(!m) break;
  const closeTagEnd = m.index + "\n</blockquote>`".length; // pozycja za `
  let j = skipWs(s, closeTagEnd);
  if(s[j] !== "+") break;
  j = skipWs(s, j+1);
  if(s[j] !== "`") break;
  // znajdz koniec calej konkatenacji
  let k = j, lastBacktick = -1;
  while(true){
    const e = endOfTemplate(s, k+1);
    if(e < 0) break;
    lastBacktick = e;
    let n2 = skipWs(s, e+1);
    if(s[n2] === "+"){
      let n3 = skipWs(s, n2+1);
      if(s[n3] === "`"){ k = n3; continue; }
    }
    break;
  }
  if(lastBacktick < 0) break;
  // usun "\n</blockquote>" i wstaw "</blockquote>" przed ostatnim backtickiem
  s = s.slice(0, m.index) + s.slice(m.index + "\n</blockquote>".length);
  const adj = lastBacktick - "\n</blockquote>".length;
  s = s.slice(0, adj) + "</blockquote>" + s.slice(adj);
  moves++;
}
fs.writeFileSync("bot.js",s);
console.log("przeniesione:",moves);
