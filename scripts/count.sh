#!/bin/bash
cd /opt/krypciokgate
mongosh banita --quiet --eval 'print("olx:", db.olxoffers.countDocuments({}))'
mongosh banita --quiet --eval 'var o=db.olxoffers.findOne(); if(o) print("link:", o.link)'
