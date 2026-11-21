const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");

const EMOJI=[
 [/USTAWIENIA|PANEL|ADMIN/i,"gear"],
[/OFERTA/i,"box"],
[/WYPŁATA|WYPLATA|WYPŁAC/i,"money"],
[/WPŁATA|KOD BLIK|KOD/i,"key"],
[/POWIADOMIENIE|WYSYŁ|WYSL/i,"bell"],
[/BŁĄD|BLAD|BRAK|LIMIT/i,"ban"],
[/STATYSTYKI/i,"chart"],
[/DOMENA/i,"globe"],
[/PROMO/i,"ticket"],
[/CASHOUT/i,"bolt"],
[/ZAPISANY|DODAN|WYSŁANO|SUKCES/i,"check"],
[/PORTFEL|ŚRODKI|SRODKI/i,"money"],
[/WERYFIKACJA/i,"doc"],
[/TWOJE OFERTY/i,"box"],
[/USTAWIENIA PRZELEW/i,"card"],
[/KRYPCIOK|MENU/i,"globe"],
];

function emojiFor(title){
  for(const [re,k] of EMOJI) if(re.test(title)) return k;
  return "dot";
}

const IDS={
 globe:"5776233299424843260", gear:"5904258298764334001", box:"5778672437122045013",
 money:"5778421276024509124", key:"6037249452824072506", bell:"6021418126061605425",
 ban:"5938215362473496448", chart:"5936143551854285132", ticket:"6034969813032374911",
 bolt:"5884428842780594914", check:"5774022692642492953", doc:"5920046907782074235",
 card:"5778421276024509124", dot:"5774022692642492953",
};

// skaner końca template literala
function endOfTemplate(src, from){
  let depth=0;
  for(let i=from;i<src.length;i++){
    const c=src[i];
    if(c==="\\"){ i++; continue; }
    if(depth===0){
      if(c==="$" && src[i+1]==="{"){ depth=1; i++; continue; }
      if(c==="`") return i;
    } else {
      if(c==="{") depth++;
      else if(c==="}") depth--;
      else if(c==="`"){ const e=endOfTemplate(src,i+1); i=e; }
      else if(c==="'"||c==='"'){ const q=c; i++; while(i<src.length && src[i]!==q){ if(src[i]==="\\")i++; i++; } }
    }
  }
  return -1;
}

const HEADER=/───────── \[ 𝕂 \] ─────────\\n❖ \*([^*]+)\*\\n──────────────────\\n\\n/g;
let count=0, out="", last=0, m;
while((m = HEADER.exec(s))){
  const title=m[1].trim();
  const key=emojiFor(title);
  out += s.slice(last, m.index);
  out += `<blockquote><tg-emoji emoji-id=\\"${IDS[key]}\\">${key==="dot"?"•":"•"}</tg-emoji> <b>${title}</b>\\n`;
  last = m.index + m[0].length;
  count++;
}
out += s.slice(last);
// domknięcie: teraz dla każdego wstawionego <blockquote> znajdź koniec literału i wstaw </blockquote>
let res="", pos=0, added=0;
const MARK="<blockquote><tg-emoji";
while(true){
  const i=out.indexOf(MARK,pos);
  if(i<0){ res+=out.slice(pos); break; }
  const bt=out.lastIndexOf("`", i);
  const e=endOfTemplate(out, i);
  if(e<0){ res+=out.slice(pos,e); break; }
  res += out.slice(pos, e) + "</blockquote>";
  pos = e;
  added++;
}
fs.writeFileSync("bot.js",res);
console.log("naglowki:",count,"domkniete:",added);
