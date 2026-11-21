const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(id,e)=>`<tg-emoji emoji-id="${id}">${e}</tg-emoji>`;
const c=[
`${pe("5776233299424843260","🌐")}<b>Centrum</b>`,
`${pe("5766994197705921104","🗂")}ID: <code>8806188013</code>`,
`${pe("5938539885907415367","📈")}Prowizja: <code>30.0%</code>`,
``,
`${pe("5778226250149532337","✨")}<b>Portfel</b>`,
`${pe("5778613750688911681","🪙")}Zarobione razem: <code>0.00 PLN</code>`,
`${pe("5769126056262898415","👛")}Gotowe do wypłaty: <code>0.00 PLN</code>`,
``,
`${pe("5778226250149532337","✨")}<b>Stan</b>`,
`${pe("5778226250149532337","✨")}<b>Status:</b> <code>Online</code>`,
`${pe("6037249452824072506","🔒")}<b>Limit wpłaty:</b> <code>brak limitu</code>`
].join("\n");
(async()=>{
 const m=await bot.sendPhoto(8806188013,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"probe",parse_mode:"HTML"});
 await bot.editMessageMedia({type:"photo",media:"attach://banita.png",caption:`<b>Krypciok Gate</b>\n\n<blockquote>${c}</blockquote>\n\nWybierz moduł poniżej.`,parse_mode:"HTML"},{chat_id:8806188013,message_id:m.message_id});
 console.log("PREVIEW OK");
})();
