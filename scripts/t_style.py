import json, re, sys, urllib.parse, urllib.request

env = open('/opt/krypciokgate/banita.env', encoding='utf-8').read()
token = re.search(r'^TOKEN=(.+)$', env, re.M).group(1).strip()
CHAT = sys.argv[1]

CAP = ('<tg-emoji emoji-id="5904258298764334001">\u2699</tg-emoji> <b>Ustawienia</b>\n\n'
       '<b>Adres LTC:</b> <code>ltc1qtest</code>')


def call(method, params, files=None):
    url = f'https://api.telegram.org/bot{token}/{method}'
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            print(method, params.get('parse_mode'), '->', json.loads(r.read())['ok'])
    except Exception as e:
        body = e.read().decode() if hasattr(e, 'read') else str(e)
        print(method, params.get('parse_mode'), 'ERR', body[:160])


# 1. sendPhoto url + HTML
call('sendPhoto', {'chat_id': CHAT, 'photo': 'https://picsum.photos/id/1015/600/400',
                   'caption': CAP, 'parse_mode': 'HTML'})
# 2. sendPhoto url, no parse_mode
call('sendPhoto', {'chat_id': CHAT, 'photo': 'https://picsum.photos/id/1016/600/400',
                   'caption': CAP})
# 3. plain text HTML
call('sendMessage', {'chat_id': CHAT, 'text': CAP, 'parse_mode': 'HTML'})
# 4. plain text markdown
call('sendMessage', {'chat_id': CHAT, 'text': CAP, 'parse_mode': 'Markdown'})
