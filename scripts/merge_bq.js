const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// 1) napraw KRYPClOK (literowka l) -> KRYPCIOK
s=s.replace(/KRYPClOK/g,"KRYPCIOK");
// 2) linki/www
s=s.replace(/<tg-emoji emoji-id=\\"([0-9]+)\\">✅<\/tg-emoji> <b>KRYPCIOK GATE<\/b>/g,'<tg-emoji emoji-id=\\"$1\\">🌐</tg-emoji> <b>KRYPCIOK GATE</b>');
// 3) naglowki BEZ zawartosci -> usun pusty </blockquote>, tresc przenies do srodka
const re=/<blockquote>(<tg-emoji emoji-id=\\"[0-9]+\\">[^<]*<\/tg-emoji> <b>(?:OFERTA · [A-ZĄĆĘŁŃÓŚŹŻ ]+|USTAWIENIA[^<]*|PANEL ADMINISTRATORA|KRYPCIOK GATE|BRAMKI PŁATNOŚCI|BRAMKA PŁATNOŚCI|BRAK ADRESU LTC|BRAK ŚRODKÓW|WYPŁATA|LIMIT WPŁATY|KOD BLIK|BŁĘDNY KOD|BŁĘDNA KWOTA|PROMO KOD|DOMENA PUBLICZNA)<\/b>\\n)<\/blockquote>\n?(›[^`]*?)`/g;
let n=0;
s=s.replace(re,(m,head,body)=>{ n++; return `<blockquote>${head}${body}</blockquote>`; });
fs.writeFileSync("bot.js",s);
console.log("scalone naglowki:",n);
