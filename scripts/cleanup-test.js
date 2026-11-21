const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	for (const c of ["ticketmasteroffers", "alebiletoffers"]) {
		const r = await db.collection(c).deleteMany({ idoferty: { $in: ["TESTTM1", "TESTAB1"] } });
		console.log(c, "usunieto:", r.deletedCount);
	}
	console.log("UZYTKOWNICY:", await db.collection("users").countDocuments(), "| PROMO:", await db.collection("promocodes").countDocuments());
	const u = await db.collection("users").findOne({ id: 8896927125 });
	console.log("owner:", u ? `approved=${u.approved} banned=${u.banned} scUntil=${u.selfCashoutUntil}` : "BRAK");
	process.exit(0);
})();
