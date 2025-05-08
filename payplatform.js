const System = require('./models/System');
const {accessSecret} = require('./common-utils');
async function payPlatform(){
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    var SYSTEM = await System.findOne({});
    try{
        await stripe.payouts.create({
            amount: SYSTEM.platformAmount,
            currency: 'usd'
        });
        SYSTEM.platformAmount = 0;
        await SYSTEM.save();
        console.log("Platform paid.");
    }
    catch(err){
        console.log("Error paying platform: " + err);
    }
}
await payPlatform();