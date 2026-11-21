import json, re, sys, urllib.request, uuid
import mimetypes

env = open('/opt/krypciokgate/banita.env', encoding='utf-8').read()
token = re.search(r'^TOKEN=(.+)$', env, re.M).group(1).strip()
CHAT = sys.argv[1]
CAP = '<tg-emoji emoji-id="5904258298764334001">\u2699</tg-emoji> <b>Ustawienia</b>\n\n<b>Adres:</b> <code>ltc1q</code>'
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
        raw = e.read()
        return json.loads(raw)


s = multipart('sendPhoto', {'chat_id': CHAT, 'caption': 'start', 'parse_mode': 'HTML'},
              {'photo': ('banita.png', PNG)})
mid = s['result']['message_id']
print('sent', mid)

A = {'type': 'photo', 'media': 'attach://f', 'caption': CAP, 'parse_mode': 'HTML'}
print('A inside-media:', multipart('editMessageMedia',
      {'chat_id': CHAT, 'message_id': mid, 'media': json.dumps(A)}, {'f': ('b.png', PNG)})['ok'])

B = {'type': 'photo', 'media': 'attach://f', 'caption': CAP}
print('B in-query   :', multipart('editMessageMedia',
      {'chat_id': CHAT, 'message_id': mid, 'media': json.dumps(B), 'parse_mode': 'HTML'},
      {'f': ('b.png', PNG)})['ok'])
