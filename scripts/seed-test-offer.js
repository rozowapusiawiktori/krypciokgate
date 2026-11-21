const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	await db.collection("ticketmasteroffers").deleteMany({ idoferty: "TESTTM1" });
	await db.collection("ticketmasteroffers").insertOne({
		idoferty: "TESTTM1",
		nazwa: "Test Wydarzenie Kontrolne",
		description: "Atlas Arena, Łódź",
		cena: "200",
		ilosc: "2",
		owner: "8896927125",
		miasto: "Łódź",
		lastonline: "20.12.2026 · 19:00",
		tagi: "Płyta;T-301;44;1-2",
		zdjecia: [],
		link: "test-wydarzenie-kontrolne"
	});
	console.log("inserted");
	process.exit(0);
})();
