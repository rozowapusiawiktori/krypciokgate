const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const ids={
 globe:"5776233299424843260",id:"5766994197705921104",chart:"5938539885907415367",
 sparkle:"5778226250149532337",coin:"5778613750688911681",wallet:"5769126056262898415",
 lock:"6037249452824072506",check:"5774022692642492953",cross:"6030757850274336631",
 ban:"5938215362473496448",person:"6032994772321309200",gear:"5904258298764334001",
 bank:"5879814368572478751",compass:"6030687898141987254",bolt:"5884428842780594914",
 refresh:"6030657343744644592",doc:"6034969813032374911",note:"5920046907782074235",
 tag:"5888620056551625531",hourglass:"5891211339170326418",trophy:"6037428784888549034",
 plus:"6032924188828767321",arrowDown:"6037157012242960559",bell:"6021418126061605425",
 card:"5778421276024509124",robot:"6030400221232501136",phone:"6039605143601680423",
 chat:"6030784887093464891",shop:"5920332557466997677",gearIcon:"6030400221232501136",
 key:"6037249452824072506",info:"6028435952299413210",eye:"6037397706505195857"
};
(async()=>{
const bad=[];
for(const [k,id] of Object.entries(ids)){
 try{ await bot.sendMessage(8806188013,`<tg-emoji emoji-id="${id}">🔹</tg-emoji> ${k}`,{parse_mode:"HTML"}); }
 catch(e){ bad.push(k+"="+id); }
}
console.log("BAD:", bad.length?bad.join(", "):"none");
})();
