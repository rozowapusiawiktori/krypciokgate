import json, re, sys, urllib.request, uuid

env = open('/opt/krypciokgate/banita.env', encoding='utf-8').read()
token = re.search(r'^TOKEN=(.+)$', env, re.M).group(1).strip()
CHAT = sys.argv[1]
BAD = '<b>niezamkniety'
PNG = open('/opt/krypciokgate/banita.png', 'rb').read()


def multipart(method, fields, files):
    b = '----x' + uuid.uuid4().hex
    body = b''
    for k, v in fields.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (fn, data) in files.items():
        body += (f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\n'
                 'Content-Type: image/png\r\n\r\n').encode() + data + b'\r\n'
    body += f'--{b}--\r\n'.encode()
    r = urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}', data=body,
                               headers={'Content-Type': f'multipart/form-data; boundary={b}'})
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return json.loads(e.read())


s = multipart('sendPhoto', {'chat_id': CHAT, 'caption': 'x'}, {'photo': ('b.png', PNG)})
mid = s['result']['message_id']

A = {'type': 'photo', 'media': 'attach://f', 'caption': BAD, 'parse_mode': 'HTML'}
ra = multipart('editMessageMedia', {'chat_id': CHAT, 'message_id': mid, 'media': json.dumps(A)},
               {'f': ('b.png', PNG)})
print('A inside-media ->', 'PARSED' if not ra['ok'] else 'IGNORED', ra.get('description', ''))

B = {'type': 'photo', 'media': 'attach://f', 'caption': BAD}
rb = multipart('editMessageMedia', {'chat_id': CHAT, 'message_id': mid, 'media': json.dumps(B),
                                    'parse_mode': 'HTML'}, {'f': ('b.png', PNG)})
print('B in-query     ->', 'PARSED' if not rb['ok'] else 'IGNORED', rb.get('description', ''))
