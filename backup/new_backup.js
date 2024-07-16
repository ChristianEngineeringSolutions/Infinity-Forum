//okay we first need to get all json files from the server
//then we need to download everything from uploads
 
var dbUri = "mongodb://127.0.0.1:27017/sasame";
 
//example dbUri with username and password for the database test
// var dbUri = "mongodb://username:pwd@127.0.0.1:27017/test";
 
 
var basePath = "./backup";
var Backup = require("backup-mongodb");
 
new Backup(dbUri, basePath).backup();