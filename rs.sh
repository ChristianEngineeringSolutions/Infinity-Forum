#!/bin/bash 

#pm2 start sasame.js -i 2 -e "PORT=3000,PORT=3001"
#pm2 stop sasame
#pm2 delete sasame
#pm2 kill
#pm2 start sasame.js
pm2 reload sasame
sudo /usr/bin/systemctl reload nginx
