const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	await db.collection("alebiletoffers").deleteMany({ idoferty: "TESTAB1" });
	await db.collection("alebiletoffers").insertOne({
		idoferty: "TESTAB1",
		nazwa: "Test Impreza AB",
		description: "Opis testowy",
		cena: "600",
		oplata: "20",
		ilosc: "1",
		owner: "8896927125",
		miasto: "Kraków",
		lastonline: "20.12.2026 19:00",
		tagi: "Normalny;Sektor A;12",
		zdjecia: [],
		link: "test-impreza-ab"
	});
	console.log("inserted");
	process.exit(0);
})();
