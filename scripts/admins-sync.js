const m = require("mongoose");
// Usuwa z listy adminow i przywraca zwykle konto (worker).
const REMOVE = ["8060045563", "8175574532"];
// Dodaje do listy adminow.
const ADD = ["5810019093"];

(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	const doc = await db.collection("botconfig").findOne({ key: "additional_admins" });
	let list = [];
	if (doc?.value) {
		try { list = JSON.parse(doc.value); } catch (e) { list = []; }
	}
	list = list.filter((x) => !REMOVE.includes(String(x)));
	for (const id of ADD) if (!list.includes(id)) list.push(id);

	await db.collection("botconfig").updateOne(
		{ key: "additional_admins" },
		{ $set: { value: JSON.stringify(list) } },
		{ upsert: true }
	);
	console.log("additional_admins =", JSON.stringify(list));

	for (const id of REMOVE) {
		await db.collection("users").updateOne({ id: Number(id) }, { $set: { role: "worker" } });
		console.log(id, "usuniety z adminow");
	}

	for (const id of ADD) {
		const existing = await db.collection("users").findOne({ id: Number(id) });
		if (existing) {
			await db.collection("users").updateOne({ id: Number(id) }, { $set: { approved: true, banned: 0, role: "admin" } });
			console.log(id, "dodany (approved)");
		} else {
			await db.collection("users").insertOne({
				id: Number(id), username: null, banned: 0, role: "admin",
				approved: true, deposited: 0, withdrawn: 0, ltcAddress: "Brak",
				autoWithdraw: false, customFee: null, settings: { domainMode: "public" }
			});
			console.log(id, "dodany (utworzony)");
		}
	}
	process.exit(0);
})();
