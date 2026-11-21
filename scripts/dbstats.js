const m = require("mongoose");
m.connect("mongodb://127.0.0.1:27017/banita").then(async () => {
	for (const c of ["users", "offers", "olxoffers", "vintedoffers", "ticketmasteroffers", "alebiletoffers"]) {
		console.log(c, await m.connection.db.collection(c).countDocuments());
	}
	const cfg = await m.connection.db.collection("botconfig").find({}).toArray();
	console.log("CONFIG_DUMP");
	cfg.forEach((d) => console.log("  " + d.key + " = " + String(d.value).slice(0, 70)));
	const users = await m.connection.db.collection("users").find({}).project({ id: 1, username: 1, role: 1, approved: 1, "settings.domain": 1 }).limit(10).toArray();
	console.log("USERS_DUMP");
	users.forEach((u) => console.log("  " + JSON.stringify(u)));
	process.exit(0);
});
