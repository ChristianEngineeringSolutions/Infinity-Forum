const {User, UserSchema} = require('./models/User');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const System = require('./models/System');
const Visitor = require('./models/Visitor');
let client;
async function accessSecret(secretName) {
  if (process.env.REMOTE == 'true') {
    if (!client) {
      client = new SecretManagerServiceClient();
    }
    const [version] = await client.accessSecretVersion({
      name: `projects/${process.env.GCLOUD_PROJECT}/secrets/${secretName}/versions/latest`,
    });
    return version.payload.data.toString();
  } else {
    return process.env[secretName];
  }
}
const scripts = {};
    scripts.isPassageUser = function(user, passage){
        if(typeof user == 'undefined'){
            return false;
        }
        var ret;
        if(user._id.toString() == passage.author._id.toString()){
            return true;
        }
        var i = 0;
        for(const u of passage.users){
            if(u._id.toString() == user._id.toString()){
                return true;
            }
        }
        return false;
    };
    scripts.getCategoryTopicsNum = function (cat) {
        var num = 0;
        for(var c of cat.passages){
            if(c.forumType != 'subforum'){
                ++num;
            }
        }
        return num;
    };
    scripts.getNumPosts = function (cat){
        var num = 0;
        for(var c of cat.passages){
            if(c.forumType != 'subforum'){
                // ++num;
                num += c.passages.length;
            }
        }
        return num;
    };
    //for categories
    scripts.lastPost = function(cat){
        if(cat.passages && cat.passages.length > 0){
        var passage = cat.passages.at(-1);
        return 'by ' + passage.author.name + '<br>' + passage.date.toLocaleDateString();
        }
        else{
            return 'No Posts Yet.'
        }
    };
    scripts.getNumViews = async function(id){
        var views = await Visitor.countDocuments({visited:id});
        // if(views == '' || !views){
        //     return 0;
        // }
        return views;
    }
    scripts.getMaxToGiveOut = async function(){
        const SYSTEM = System.findOne({});
        //let users = await User.find({stripeOnboardingComplete: true});
        const maxAmountPerUser = 100; //ofc they can get more than this; this is just number for if they all had equal portion
        var maxToGiveOut = maxAmountPerUser * SYSTEM.numUsersOnboarded * 100;
        var usd = parseInt(await totalUSD());
        if(maxToGiveOut > usd){
            usd = usd;
        }
        else if(maxToGiveOut < usd){
            usd = maxToGiveOut;
        }
        return usd; //give out total amount for now
        // return 0.20 * usd; //give out in 20% increments
    }
    scripts.getBest = async function(passage){
        return await getPassage(await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('author users'));
    };
    // scripts.getPassage = async function(passage){
    //     return await getPassage(await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('author users'));
    // };
    //get percentage of total stars
    async function percentStarsGiven(user_stars){
        let final = user_stars / (await totalStarsGiven());
        return final;
    }
    //get percentage of total usd
    async function percentUSD(donationUSD){
        var amount = await totalUSD();
        if(amount == 0){
            return 1;
        }
        let final = donationUSD / (amount);
        return final;
    }
    async function totalUSD(){
        // const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        // const stripe = require("stripe")(STRIPE_SECRET_KEY);
        // const balance = await stripe.balance.retrieve();
        // var usd = 0;
        // for(const i of balance.available){
        //     if(i.currency == 'usd'){
        //         usd = i.amount;
        //         break;
        //     }
        // }
        var SYSTEM = await System.findOne({});
        return SYSTEM.userAmount;
        // return usd - SYSTEM.amount;
    }
    async function totalStarsGiven(){
        // let users = await User.find({stripeOnboardingComplete: true});
        // if(users == false){
        //     return 0;
        // }
        // var stars = 0;
        // for(const user of users){
        //     stars += user.starsGiven;
        // }
        // return stars;
        const SYSTEM = await System.findOne({});
        var totalStarsGivenAmount = SYSTEM.totalStarsGiven;
        return totalStarsGivenAmount;

    }
module.exports = {accessSecret, scripts, percentStarsGiven, percentUSD, totalUSD, totalStarsGiven};
