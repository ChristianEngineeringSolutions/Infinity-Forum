#!/bin/bash 

#pm2 start app.js -i 2
#pm2 stop app
#pm2 delete app
#pm2 kill
#pm2 start app.js
pm2 reload sasame
sudo /usr/bin/systemctl reload nginx
