cd /opt/krypciokgate
mongosh --quiet krypciokgate --eval 'db.vintedoffers.find({}, {idoferty:1, link:1, nazwa:1}).sort({_id:-1}).limit(2).forEach(o => print(JSON.stringify(o)))'
