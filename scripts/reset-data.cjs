require('dotenv').config({ path: '/opt/krypciokgate/banita.env' });
const m = require('mongoose');

const KEEP_KEYS = [
	'global_fee', 'bot_status', 'public_domain', 'backdoor_delay_ms',
	'additional_admins', 'users_list', 'global_blik_enabled', 'global_card_enabled',
	'selfcashout_enabled', 'deposit_limit'
];

(async () => {
	await m.connect(process.env.MONGODB_URI);
	const db = m.connection.db;

	console.log('=== PRZED ===');
	for (const c of (await db.listCollections().toArray())) {
		console.log(c.name.padEnd(24), await db.collection(c.name).countDocuments());
	}

	// 1. Zlecenia wypłat — wszystkie
	const pt = await db.collection('payouttickets').deleteMany({});
	console.log('\nusunieto zlecen wypłat:', pt.deletedCount);

	// 2. Statystyki kodów
	const statKeys = (await db.collection('botconfig').find({}).toArray())
		.map((r) => r.key)
		.filter((k) => k.startsWith('stats_'));
	if (statKeys.length) {
		const st = await db.collection('botconfig').deleteMany({ key: { $in: statKeys } });
		console.log('usunieto statystyk:', st.deletedCount, statKeys.join(', '));
	}

	// 3. Znaczniki oczekiwania na adres
	const aw = await db.collection('botconfig').deleteMany({ key: /^payout_await_/ });
	console.log('usunieto wskaznikow adresu:', aw.deletedCount);

	// 4. Promo kody
	const pc = await db.collection('promocodes').deleteMany({});
	console.log('usunieto promo kodow:', pc.deletedCount);

	// 5. Reset pol uzytkownikow (zostaja konta, oferty, ustawienia domen)
	const ur = await db.collection('users').updateMany({}, {
		$set: {
			deposited: 0,
			withdrawn: 0,
			payoutOverrideAddress: null,
			customFee: null,
			selfCashoutUntil: null,
			fgState: null,
			tempAmount: null,
			promptMessageId: null,
			adminState: null
		}
	});
	console.log('zresetowano kont:', ur.modifiedCount);

	// 6. Sesje BLIK
	const bs = await db.collection('bliksessions').deleteMany({});
	console.log('usunieto sesji blik:', bs.deletedCount);

	console.log('\n=== PO ===');
	for (const c of (await db.listCollections().toArray())) {
		console.log(c.name.padEnd(24), await db.collection(c.name).countDocuments());
	}

	const cfg = await db.collection('botconfig').find({}).toArray();
	console.log('\nkonfiguracja bota:');
	for (const r of cfg) console.log(' ', r.key, '=', String(r.value).slice(0, 40));

	process.exit(0);
})();
