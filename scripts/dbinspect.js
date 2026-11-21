const mongoose=require("/opt/krypciokgate/node_modules/mongoose");
const fs=require("fs");
const env=fs.readFileSync("/opt/krypciokgate/banita.env","utf8");
const uri=(env.match(/^MONGO_URI=(.+)$/m)||[])[1].trim();
(async()=>{
 await mongoose.connect(uri);
 const c=mongoose.connection.db.collection("offervinteds");
 const docs=await c.find({}).sort({_id:-1}).limit(3).toArray();
 docs.forEach(d=>console.log(d.idoferty, "nazwa:", (d.nazwa||"").length, "opis:", (d.description||"").length, "tagi:", (d.tagi||"").length, "link:", (d.link||"").length));
 console.log("klucze:", docs[0] ? Object.keys(docs[0]).join(",") : "brak");
 await mongoose.disconnect();
})();
