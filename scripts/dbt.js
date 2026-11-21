const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const CHAT=8806188013;
(async()=>{
const kb={inline_keyboard:[[{text:"Menu główne",icon_custom_emoji_id:"5895507195524550741",callback_data:"m"}]]};
try{
const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});
await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:"<b>test1</b>"},{chat_id:CHAT,message_id:m.message_id,reply_markup:kb});
console.log("T1 OK");
const m2=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});
await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:`<tg-emoji emoji-id="5776233299424843260">🌐</tg-emoji> <b>x</b>`},{chat_id:CHAT,message_id:m2.message_id,reply_markup:kb});
console.log("T2 OK");
}catch(e){console.log("FAIL",e.message);}
})();
