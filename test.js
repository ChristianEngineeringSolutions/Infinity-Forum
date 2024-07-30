(async function(){
	const axios = require("axios");
  	const https = require('https');
  	 axios.create({
            httpsAgent: new https.Agent({keepAlive: true}),
        });
  	 const pic = await axios.get('http://localhost:3000/protected/0f7b2b11-fad0-4eb1-b38f-0af9b7e39028_1.png', {
      responseType: "arraybuffer",
    });
  	 console.log(pic.data);
})();