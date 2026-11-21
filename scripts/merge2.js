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
      else if(c==="`"){ i=endOfTemplate(src,i+1); }
      else if(c==="'"||c==='"'){const q=c;i++;while(i<src.length&&src[i]!==q){if(src[i]==="\\")i++;i++;}}
    }
  }
  return -1;
}
// Wzorzec: literal konczacy sie na "\n</blockquote>` +" -> przenies
let n=0;
while(true){
  let changed=false;
  const re=/\n<\/blockquote>` \+/g;
  const m=re.exec(s);
  if(!m) break;
  const i=m.index;
  const bt=s.lastIndexOf("`", i);
  const e=endOfTemplate(s, bt+1);
  // sprawdz czy nastepny literal konczy sie bezposrednio po tresci
  let j=e+1;
  while(/\s/.test(s[j])) j++;
  if(s[j]==="+" && s[j+1]==="`"){
    // literal + `tresc...` -> scal: usun "</blockquote>" i "+ `" i wstaw na koncu
    const e2=endOfTemplate(s, j+2);
    if(e2>0){
        const body=s.slice(j+2, e2);
        s = s.slice(0,i) + "\n" + body + "</blockquote>" + s.slice(e2+1);
        n++; changed=true; continue;
    }
  }
  break;
}
fs.writeFileSync("bot.js",s);
console.log("scalone:",n);
