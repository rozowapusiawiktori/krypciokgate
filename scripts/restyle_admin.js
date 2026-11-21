const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
const H=(t)=>`>───────── [ 𝕂 ] ─────────\\n❖ *${t}*\\n──────────────────\\n\\n`;
// helper wklejony raz
if(!s.includes("function noticeBox")){
  s=s.replace("// ── Styl wiadomości:", "// ── Uniwersalny box potwierdzeń ──\\nfunction noticeBox(title, lines) {\\n\\treturn `───────── [ 𝕂 ] ─────────\\\\n❖ *${title}*\\\\n──────────────────\\\\n\\\\n` + lines.map((l) => `› ${l}`).join(\"\\\\n\");\\n}\\n\\n// ── Styl wiadomości:");
}
const pairs=[
 ["`<tg-emoji emoji-id=\\\\\"5774022692642492953\\\\\">✅</tg-emoji> Dodano użytkownika <code>${text}</code> do grona administratorów.",
  "noticeBox(\"ADMIN DODANY\", [`<code>${text}</code> ma teraz uprawnienia administratora.`)"],
 ["\"🎉 **Otrzymałeś uprawnienia administratora!** Wpisz /admin, aby otworzyć panel.\"",
  "noticeBox(\"UPRAWNIENIA\", [\"Otrzymałeś uprawnienia administratora.\", \"Wpisz `/admin`, aby otworzyć panel.\"])"],
 ["`<tg-emoji emoji-id=\\\\\"5774022692642492953\\\\\">✅</tg-emoji> Usunięto użytkownika <code>${text}</code> z grona administratorów.",
  "noticeBox(\"ADMIN USUNIĘTY\", [`Odebrano uprawnienia: <code>${text}</code>.`])"],
 ["\"❌ **Twoje uprawnienia administratora zostały cofnięte.**\"",
  "noticeBox(\"UPRAWNIENIA\", [\"Twoje uprawnienia administratora zostały cofnięte.\"])"],
];
let n=0;
for(const [a,b] of pairs){ if(s.includes(a)){ s=s.split(a).join(b); n++; } else console.log("BRAK:",a.slice(0,55)); }
fs.writeFileSync("bot.js",s);
console.log("podmienione",n);
