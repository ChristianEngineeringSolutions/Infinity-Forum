#!/bin/bash 

pm2 stop sasame
pm2 delete sasame
pm2 kill
pm2 start sasame.js
sudo /usr/bin/systemctl reload nginx
