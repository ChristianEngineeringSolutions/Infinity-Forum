//Working pseudo code

const passageController = require("./controllers/passageController");
const User = require("./models/User");

//getting messages

user.messages = [{
    foreignKey: 'Passage'
}];

//get messages for user
User.findOne({_id: user._id}).populate({path: 'messages', options: {sort: {'stars': '-1'}}});

//nevermind,
//just create model for Messages
//then star message on StarPassage for consistency

//clear out old messages for user
//...TODO

//notes for filestream

passage.fileStreamPath = '/somepath'; //unique key
//require admin to update path
//create if not exists in filesystem
//code is file content
//title is file name