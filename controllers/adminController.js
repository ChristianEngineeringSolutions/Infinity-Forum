const adminService = require('../services/adminService.js');
const passageService = require('../services/passageService.js');
const fileService = require('../services/fileService.js');
const { getRedisClient, getRedisOps } = require('../config/redis.js');
const { exec } = require('child_process');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const Queue = require('bull');
const bookmarkService = require('../services/bookmarkService');
const browser = require('browser-detect');
const { scripts } = require('../common-utils');



// Initialize Redis and Bull Queue
const redisClient = getRedisClient();
const redis = getRedisOps();
const feedQueue = new Queue('feed-generation', process.env.REDIS_URL || 'redis://localhost:6379');

// Controller functions
const runFile = (req, res) => {
    var file = req.body.file;
    var ext = file.split('.')[file.split('.').length - 1];
    var bash = 'ls';
    switch(ext){
        case 'js':
        bash = 'node ' + file;
        break;
        case 'sh':
        bash = 'sh ' + file;
        break;
    }
    exec(bash, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        res.send(JSON.stringify(err));
        return;
      }
      res.send(stdout);
    });
};

const makeMainFile = async (req, res) => {
    var passage = await Passage.findOne({_id: req.body.passageID});
    var passage = await passageService.getPassage(passage);
    //check if file/dir already exists
    var exists = await Passage.findOne({fileStreamPath: req.body.fileStreamPath});
    if(exists != null){
        exists.mainFile = false;
        await exists.save();
    }
    passage.mainFile = true;
    await passage.save();
    //restart server to apply changes
    fileService.updateFile(req.body.fileStreamPath, passage.all);
};

const removeFile = async (req, res) => {
    var passage = await Passage.findOne({_id: req.body._id});
    passage.filename = '';
    passage.mimeType = '';
    await passage.save();
    res.send("Done.");
};

const updateFile = (req, res) => {
    var file = req.body.file;
    var content = req.body.content;
    fs.writeFile(file, content, function(err){
      if (err) return console.log(err);
      res.send('Done');
    });
};

const updateFileStream = async (req, res) => {
    var passage = await Passage.findOne({_id: req.body.passageID});
    passage.fileStreamPath = req.body.fileStreamPath;
    await passage.save();
    //create file if not exists
    //else update
    //check if directory or file
    var isDirectory = false;
    var isFile = false;
    if(passage.fileStreamPath.at(-1) == '/'){
        isDirectory = true;
    }
    else{
        isFile = true;
    }
    //TODO: check if need to check for exists or if fsp handles this
    if(isDirectory){
        await fsp.mkdir(__dirname + passage.fileStreamPath);
    }
    else if(isFile){
        await fsp.writeFile(__dirname + passage.fileStreamPath);
    }
};

const syncFileStreamController = async (req, res) => {
    await adminService.syncFileStream();
    res.send("Done.");
};

const serverEval = (req, res) => {
    if(process.env.DOMAIN == 'localhost'){
        eval(req.code);
    }
};

const clearAllFeedCaches = async (req, res) => {
  try {
    // Get all feed cache keys
    const keys = await redisClient.keys('user_feed:*');
    
    if (keys.length > 0) {
      // Delete all feed caches
      await redisClient.del(keys);
      console.log(`Cleared ${keys.length} feed caches`);
    }
    
    res.json({ success: true, cleared: keys.length });
  } catch (error) {
    console.error('Error clearing feed caches:', error);
    res.status(500).json({ error: 'Failed to clear feed caches' });
  }
};

const invalidateFeedCache = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }
    
    const cacheKey = `user_feed:${userId}`;
    await redisClient.del(cacheKey);
    
    // Queue a job to regenerate the feed
    await feedQueue.add(
      { userId },
      { priority: 1 } // High priority
    );
    
    res.json({ success: true, message: 'Feed cache invalidated and regeneration queued' });
  } catch (error) {
    console.error('Error invalidating feed cache:', error);
    res.status(500).json({ error: 'Failed to invalidate feed cache' });
  }
};

const dbBackupZip = async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  exec("mongodump", async function(){
      return res.send('Database backed up in /dump');
  });
};

const uploadsBackupZip = async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  var directory1 = __dirname + '/dist/uploads';
  var AdmZip = require("adm-zip");
  var zip1 = new AdmZip();
  //compress /dump and /dist/uploads then send
  const files = await fsp.readdir(directory1);
  for(const file of files){
      console.log(file);
      zip1.addLocalFile(__dirname + '/dist/uploads/' + file);
  }
  return res.send(zip1.toBuffer());
};

const protectedBackupZip = async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  var directory1 = __dirname + '/protected';
  var AdmZip = require("adm-zip");
  var zip1 = new AdmZip();
  //compress /dump and /dist/uploads then send
  const files = await fsp.readdir(directory1);
  for(const file of files){
      console.log(file);
      zip1.addLocalFile(__dirname + '/protected/' + file);
  }
  return res.send(zip1.toBuffer());
};

const restoreDatabase = async (req, res) => {
  var AdmZip = require("adm-zip");
  var files = req.files;
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  var fileToUpload = req.files.file;
fileToUpload.mv('./tmp/db.zip', async function(err) {
if (err) {
  console.error("Error moving uploaded file:", err);
  return res.status(500).send("Error uploading and processing file.");
}

try {
  const zip1 = new AdmZip(__dirname + '/tmp/db.zip');
  zip1.extractAllTo(__dirname + '/dump/sasame/');
  await fsp.rename(__dirname + "/dump/sasame/system.version.bson", __dirname + "/dump/admin/system.version.bson");
  await fsp.rename(__dirname + "/dump/sasame/system.version.metadata.json", __dirname + "/dump/admin/system.version.metadata.json");
  await fsp.unlink(__dirname + "/tmp/db.zip");
var pwd = await accessSecret("MONGO_PASSWORD");
let mongorestore;
if (process.env.REMOTE == 'true') {
mongorestore = `mongorestore --username ${process.env.MONGO_USER} --password '${req.body.password}'`;
} else {
mongorestore = 'mongorestore';
}
  exec(`${mongorestore} --authenticationDatabase admin`, async function(error, stdout, stderr) {
      if (error) {
          console.error("Error during mongorestore:", error);
          return res.status(500).send("Error restoring database.");
      }
      console.log("mongorestore stdout:", stdout);
      console.error("mongorestore stderr:", stderr);
      return res.send("Database restored.");
  });
} catch (error) {
  console.error("Error processing ZIP file:", error);
  // Handle the AdmZip or file system errors
  if (error.message === 'Invalid filename') {
      return res.status(400).send("Invalid ZIP file provided.");
  } else {
      return res.status(500).send("Error processing ZIP file.");
  }
}
});
};

const restoreUploads = async (req, res) => {
var AdmZip = require("adm-zip");
  try {
      // Check if files were uploaded
      if (!req.files || Object.keys(req.files).length === 0 || !req.files.file) {
          return res.status(400).send('No files were uploaded.');
      }
      
      const fileToUpload = req.files.file;
      const uploadPath = path.join(__dirname, 'tmp', 'uploads.zip');
      const extractPath = path.join(__dirname, 'dist', 'uploads');
      
      // Move the file
      await new Promise((resolve, reject) => {
          fileToUpload.mv(uploadPath, (err) => {
              if (err) {
                  console.error("Error moving uploaded file:", err);
                  reject(err);
              } else {
                  resolve();
              }
          });
      });
      
      // Process the ZIP file
      const zip1 = new AdmZip(uploadPath);
      zip1.extractAllTo(extractPath);
      await fsp.unlink(uploadPath);
      
      // Send response after all operations are complete
      res.send("Uploads restored.");
      
  } catch (error) {
      console.error("Error processing request:", error);
      // Only send response if one hasn't been sent already
      if (!res.headersSent) {
          res.status(500).send("An error occurred during the upload and restore process.");
      }
  }
};

const restoreProtected = async (req, res) => {
  var AdmZip = require("adm-zip");
  var files = req.files;
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  var fileToUpload = req.files.file;
  fileToUpload.mv('./tmp/protected.zip', async function(err) {
      var zip1 = new AdmZip(__dirname + '/tmp/protected.zip');
      zip1.extractAllTo(__dirname + '/protected/');
      await fsp.unlink(__dirname + "/tmp/protected.zip");
      return res.send("Protected Uploads restored.");
  });
};

const getAdmin = async (req, res) => {
  var focus = req.params.focus || false;
  // await mongoSnap('./backup/collections.tar'); // backup
  // await mongoSnap('./backups/collections.tar', true); // restore
  const ISMOBILE = browser(req.headers['user-agent']).mobile;
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  else{
      var whitelistOption = false;
      if(focus == 'requested-daemons' || focus == false){
          whitelistOption = false;
          //view all passages requesting to be a public daemon
          var passages = await Passage.find({public_daemon:1}).sort('-stars').populate('users author sourceList');
      }else if(focus == 'blacklisted'){
          whitelistOption = true;
          var blacklisted = [
              "whatsapp", 'btn', 'tokopedia', 'gopay',
              'dbs', 'call center', 'indodax'
          ];
          // Create regex pattern for substring matching
          var blacklistPattern = new RegExp(blacklisted.join('|'), 'i');
          var passages = await Passage.aggregate([
              {
                  $match: {
                      $or: [
                          { title: blacklistPattern },
                          { content: blacklistPattern }
                      ]
                  }
              },
              {
                  $lookup: {
                      from: 'Users', // <--- Changed from 'users' to 'Users'
                      localField: 'author',
                      foreignField: '_id',
                      as: 'user'
                  }
              },
              {
                  $unwind: {
                      path: '$user',
                      preserveNullAndEmptyArrays: true
                  }
              },
              {
                  $match: {
                      $or: [
                          { 'user.whitelisted': { $ne: true } },
                          { user: { $exists: false } }
                      ]
                  }
              },
              {
                  $sort: { _id: -1 }
              },
              {
                  $project: {
                      user: 0
                  }
              }
          ]);
          
          // Populate the aggregation results
          passages = await Passage.populate(passages, passageService.standardPopulate);

      }
      let bookmarks = [];
      // if(req.session.user){
      //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
      // }
      if(req.session.user){
          bookmarks = bookmarkService.getBookmarks(req.session.user);
      }
      passages = await passageService.fillUsedInList(passages);
      // bcrypt.hash('test', 10, function (err, hash){
      //     if (err) {
      //       console.log(err);
      //     }
      //     console.log(hash);
      //   });
      console.log(passages);
      return res.render("admin", {
          subPassages: false,
          ISMOBILE: ISMOBILE,
          test: 'test',
          whitelistOption: whitelistOption,
          passageTitle: 'Infinity Forum', 
          scripts: scripts, 
          passages: passages, 
          passage: {id:'root', author: {
              _id: 'root',
              username: 'Sasame'
          }},
          bookmarks: bookmarks,

      });
  }
};
const uploadToGcs = async (req, res) => {
  if (!req.session.user || !req.session.user.admin) {
    return res.redirect('/');
  } else {
    try {
      const bucketName = 'infinity-forum-backup';
      
      const folderPath1 = path.join(__dirname, 'dump');
      const folderPath2 = path.join(__dirname, 'dist/uploads');
      const folderPath3 = path.join(__dirname, 'protected');
      
      // Upload directories in parallel
      await Promise.all([
        adminService.uploadDirectoryToGCS(folderPath1, bucketName),
        adminService.uploadDirectoryToGCS(folderPath2, bucketName),
        adminService.uploadDirectoryToGCS(folderPath3, bucketName)
      ]);
      
      return res.send('Backup process completed successfully.');
    } catch (error) {
      console.error('Error uploading to GCS:', error);
      res.status(500).send('Upload failed: ' + error.message);
    }
  }
};

// Export controller functions
module.exports = {
    runFile,
    makeMainFile,
    removeFile,
    updateFile,
    updateFileStream,
    syncFileStreamController,
    serverEval,
    clearAllFeedCaches,
    invalidateFeedCache,
    dbBackupZip,
    uploadsBackupZip,
    protectedBackupZip,
    restoreDatabase,
    restoreUploads,
    restoreProtected,
    getAdmin,
    uploadToGcs
};