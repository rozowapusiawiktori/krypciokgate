const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const env=fs.readFileSync("/opt/krypciokgate/banita.env","utf8");
const TOKEN=(env.match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const CHAT=8806188013;
(async()=>{
 const photo=fs.createReadStream("/opt/krypciokgate/banita.png");
 const m=await bot.sendPhoto(CHAT,photo,{caption:"A"});
 console.log("sent",m.message_id);
 // 1: editMessageMedia + attach + parse_mode w options + third arg
 try{ await bot.editMessageMedia({type:"photo",media:"attach://banita.png",caption:"<b>TEST1</b> <code>x</code>"},
   {chat_id:CHAT,message_id:m.message_id,parse_mode:"HTML"},
   {filename:"banita.png",contentType:"image/png"});
   console.log("T1 OK (attach+parse_mode)");}catch(e){console.log("T1 ERR",e.message);}
 // 2: editMessageMedia bez trzeciego argumentu
 try{ await bot.editMessageMedia({type:"photo",media:"attach://banita.png",caption:"<b>TEST2</b> <code>y</code>"},
   {chat_id:CHAT,message_id:m.message_id,parse_mode:"HTML"});
   console.log("T2 OK (bez formData)");}catch(e){console.log("T2 ERR",e.message);}
 // 3: editMessageCaption
 try{ await bot.editMessageCaption("<b>TEST3</b> <code>z</code>",{chat_id:CHAT,message_id:m.message_id,parse_mode:"HTML"});
   console.log("T3 OK (editMessageCaption)");}catch(e){console.log("T3 ERR",e.message);}
})();
