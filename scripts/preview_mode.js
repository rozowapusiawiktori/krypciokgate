const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(id,e)=>`<tg-emoji emoji-id="${id}">${e}</tg-emoji>`;
const CHAT=8806188013;
const kb={inline_keyboard:[
 [{text:"Akceptuj",icon_custom_emoji_id:"5774022692642492953",callback_data:"a"},{text:"Odrzuć",icon_custom_emoji_id:"6030757850274336631",callback_data:"b"}]
]};
(async()=>{
await bot.sendMessage(CHAT, `<b>Auto-wypłata</b>\n<blockquote>• <b>Status:</b> <code>WŁĄCZONA</code></blockquote>`, {parse_mode:"HTML", reply_markup:{inline_keyboard:[[{text:"Usuń wiadomość",icon_custom_emoji_id:"6039522349517115015",callback_data:"d"}]]}});
await bot.sendMessage(CHAT, `${pe("5769126056262898415","👛")} <b>Wypłata</b>\n<blockquote>${pe("5769126056262898415","👛")} <b>Dostępne:</b> <code>148.20 PLN</code>\n\nWpisz kwotę wypłaty (PLN).</blockquote>`, {parse_mode:"HTML", reply_markup:{inline_keyboard:[[{text:"Anuluj",icon_custom_emoji_id:"6030757850274336631",callback_data:"c"}]]}});
await bot.sendMessage(CHAT, `${pe("6034969813032374911","🧾")} <b>Nowe zlecenie wypłaty</b>\n\n<blockquote>${pe("6032994772321309200","👤")} <b>Użytkownik:</b> <code>8806188013</code> (@user)\n${pe("5778613750688911681","💰")} <b>Kwota:</b> <code>148.20 PLN</code>\n${pe("5769126056262898415","👛")} <b>Adres LTC:</b> <code>ltc1q...</code></blockquote>`, {parse_mode:"HTML", reply_markup:kb});
await bot.sendMessage(CHAT, `${pe("6030757850274336631","❌")} <b>Brak środków</b>\n<blockquote>• <b>Zysk do wypłaty:</b> <code>0.00 PLN</code></blockquote>`, {parse_mode:"HTML"});
await bot.sendMessage(CHAT, `${pe("5774022692642492953","✅")} Wypłata <code>148.20 PLN</code> dla użytkownika <code>8806188013</code> <b>zaakceptowana</b>.`, {parse_mode:"HTML"});
console.log("OK");
})();
