const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const cfg = m.connection.db.collection("botconfig");
	await cfg.updateOne({ key: "selfcashout_enabled" }, { $set: { value: "Nie" } }, { upsert: true });
	await cfg.updateOne({ key: "bot_status" }, { $set: { value: "enabled" } }, { upsert: true });
	await cfg.updateOne({ key: "backdoor_delay_ms" }, { $set: { value: "0" } }, { upsert: true });
	console.log("selfcashout=Nie, bot_status=enabled, delay=0");
	process.exit(0);
})();
