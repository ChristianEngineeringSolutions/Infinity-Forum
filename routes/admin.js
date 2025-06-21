'use strict';

const express = require('express');
const router = express.Router();
const {requiresAdmin} = require('../middleware/auth.js'); 
const {
    getFormattedDateTime,
    createGcsFolder,
    getContentType,
    uploadFileWithRetry,
    processDirectory,
    uploadDirectoryToGCS,
    downloadMostRecentBackup,
    downloadMultipleFolders
} = require('../controllers/adminController');
const { exec } = require('child_process');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const redis = require('redis');
const Queue = require('bull');

// Initialize Redis and Bull Queue
const feedQueue = new Queue('feed-generation', process.env.REDIS_URL || 'redis://localhost:6379');
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL
  });
} else {
  redisClient = redis.createClient();
}

// Helper functions from sasame.js
async function syncFileStream(){
    //clear filestream
    //await Passage.updateMany({mainFile:true}, {mainFile:false});
    //don't uncomment, dangerous
    //await Passage.deleteMany({fileStreamPath: {$ne:null}});
    var author = await User.findOne({admin:true});
    var top = await Passage.findOne({
        title: 'Infinity Forum Source Code',
        author: author._id,
        fileStreamPath: __dirname + '/',
        mainFile: true,
        public: false,
        parent: null
    });
    console.log(top);
}

function updateFile(file, content){
    fs.writeFile(file, content, function(err){
        if (err) return console.log(err);
        //restart server to apply changes
        //happens after write on dev
        if(process.env.REMOTE){
            var shell = require('shelljs');
            //in sudo visudo
            //user ALL = NOPASSWD: /home/user/Infinity-Forum/restart.sh
                var bash = 'bash ' + __dirname + 'restart.sh';
            shell.exec(bash, function(code, output) {
            console.log('Exit code:', code);
            console.log('Program output:', output);
            });

        }
    });
}

async function getPassage(passage) {
    // This function should be implemented based on the sasame.js implementation
    // For now, returning the passage as-is
    return passage;
}

// File management routes
router.post('/run_file', requiresAdmin, function(req, res) {
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
      // the *entire* stdout and stderr (buffered)
      // console.log(`stdout: ${stdout}`);
      // console.log(`stderr: ${stderr}`);
    });
});

router.post('/makeMainFile', requiresAdmin, async function(req, res){
    var passage = await Passage.findOne({_id: req.body.passageID});
    var passage = await getPassage(passage);
    //check if file/dir already exists
    var exists = await Passage.findOne({fileStreamPath: req.body.fileStreamPath});
    if(exists != null){
        exists.mainFile = false;
        await exists.save();
    }
    passage.mainFile = true;
    await passage.save();
    //restart server to apply changes
    updateFile(req.body.fileStreamPath, passage.all);
});

router.post('/removeFile', requiresAdmin, async (req, res) => {
    var passage = await Passage.findOne({_id: req.body._id});
    passage.filename = '';
    passage.mimeType = '';
    await passage.save();
    res.send("Done.");
});

router.post('/update_file', requiresAdmin, function(req, res) {
    var file = req.body.file;
    var content = req.body.content;
    fs.writeFile(file, content, function(err){
      if (err) return console.log(err);
      res.send('Done');
    });
});

router.post('/updateFileStream', requiresAdmin, async function(req, res) {
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
    const fsp = require('fs').promises;
    //TODO: check if need to check for exists or if fsp handles this
    if(isDirectory){
        await fsp.mkdir(__dirname + passage.fileStreamPath);
    }
    else if(isFile){
        await fsp.writeFile(__dirname + passage.fileStreamPath);
    }
});

router.post('/syncfilestream', requiresAdmin, async function(req, res){
    const fsp = require('fs').promises;
    await syncFileStream();
    // var code = await fsp.readFile("/home/uriah/Desktop/United Life/CES/ChristianEngineeringSolutions/.gitignore", 'utf-8')
    // console.log(code);
    // console.log(await fsp.readFile("/home/uriah/Desktop/United Life/CES/ChristianEngineeringSolutions/rs.sh"));
    res.send("Done.");
});

// System evaluation
router.post('/server_eval', requiresAdmin, function(req, res) {
    if(process.env.DOMAIN == 'localhost'){
        eval(req.code);
    }
});

// API admin routes
router.post('/api/admin/clear-all-feed-caches', requiresAdmin, async (req, res) => {
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
});

router.post('/api/admin/invalidate-feed-cache', requiresAdmin, async (req, res) => {
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
});

// Admin-only routes (lines 4959-5710 in sasame.js)
 app.get('/dbbackup.zip', requiresAdmin, async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  exec("mongodump", async function(){
      // var directory1 = __dirname + '/dump';
      // var AdmZip = require("adm-zip");
      // const fsp = require('fs').promises;
      // var zip1 = new AdmZip();
      // var zip2 = new AdmZip();
      // //compress /dump and /dist/uploads then send
      // const files = await readdir(directory1);
      // for(const file of files){
      //     console.log(file);
      //     zip1.addLocalFolder(__dirname + '/dump/' + file);
      // }
      // return res.send(zip1.toBuffer());
      return res.send('Database backed up in /dump');
  });
});
function getZip(which){

}
app.get('/uploadsbackup.zip', requiresAdmin, async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  var directory1 = __dirname + '/dist/uploads';
  var AdmZip = require("adm-zip");
  const fsp = require('fs').promises;
  var zip1 = new AdmZip();
  //compress /dump and /dist/uploads then send
  const files = await readdir(directory1);
  for(const file of files){
      console.log(file);
      zip1.addLocalFile(__dirname + '/dist/uploads/' + file);
  }
  return res.send(zip1.toBuffer());
});
app.get('/protectedbackup.zip', requiresAdmin, async (req, res) => {
  if(!req.session.user || !req.session.user.admin){
      return res.redirect('/');
  }
  var directory1 = __dirname + '/protected';
  var AdmZip = require("adm-zip");
  const fsp = require('fs').promises;
  var zip1 = new AdmZip();
  //compress /dump and /dist/uploads then send
  const files = await readdir(directory1);
  for(const file of files){
      console.log(file);
      zip1.addLocalFile(__dirname + '/protected/' + file);
  }
  return res.send(zip1.toBuffer());
});
app.post('/restoredatabase', requiresAdmin, async (req, res) => {
  var AdmZip = require("adm-zip");
  const fsp = require('fs').promises;
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
});
app.post('/restoreuploads', requiresAdmin, async (req, res) => {
var AdmZip = require("adm-zip");
  try {
      // Check if files were uploaded
      if (!req.files || Object.keys(req.files).length === 0 || !req.files.file) {
          return res.status(400).send('No files were uploaded.');
      }
      
      const fileToUpload = req.files.file;
      const uploadPath = path.join(__dirname, 'tmp', 'uploads.zip');
      const extractPath = path.join(__dirname, 'dist', 'uploads');
      
      // Ensure the destination directory exists
      // await fs.mkdir(extractPath, { recursive: true });
      
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
});
app.post('/restoreprotected', requiresAdmin, async (req, res) => {
  var AdmZip = require("adm-zip");
  const fsp = require('fs').promises;
  var files = req.files;
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  var fileToUpload = req.files.file;
  fileToUpload.mv('./tmp/protected.zip', async function(err) {
      var zip1 = new AdmZip(__dirname + '/tmp/protected.zip');
      zip1.extractAllTo(__dirname + '/protected/');
      await fsp.unlink(__dirname + "/tmp/protected.zip");
      return res.send("Protected Uploads restored.");
  });
});
app.get('/admin/:focus?/', requiresAdmin, async function(req, res){
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
          var passages = await Passage.aggregate([
              {
                  $match: {
                      $or: [
                          { title: { $in: blacklisted } },
                          { content: { $in: blacklisted } }
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

      }
      let bookmarks = [];
      // if(req.session.user){
      //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
      // }
      if(req.session.user){
          bookmarks = getBookmarks(req.session.user);
      }
      passages = await fillUsedInList(passages);
      // bcrypt.hash('test', 10, function (err, hash){
      //     if (err) {
      //       console.log(err);
      //     }
      //     console.log(hash);
      //   });
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
});

// Simulation Management Routes (Admin Only)
app.get('/simulation', requiresAdmin, async (req, res) => {
  try {
      const ISMOBILE = browser(req.headers['user-agent']).mobile;
      res.render('simulation', {
          ISMOBILE: ISMOBILE,
          user: req.session.user,
          page: 'simulation',
          passageTitle: 'Simulation Management'
      });
  } catch (error) {
      console.error('Error loading simulation page:', error);
      res.status(500).send('Error loading simulation page');
  }
});

app.post('/generate-simulation', requiresAdmin, async (req, res) => {
  try {
      const { numUsers, numPassages, contentType, includeImages, includeSubContent } = req.body;
      const domain = process.env.DOMAIN || 'http://localhost:3000';
      
      // Import the fake data generator
      const fakeGenerator = require('./dist/js/fake.js');
      
      // Validate input
      if (!numUsers || !numPassages || numUsers < 1 || numPassages < 1) {
          return res.status(400).json({ error: 'Invalid parameters' });
      }
      
      if (numUsers > 50 || numPassages > 100) {
          return res.status(400).json({ error: 'Too many users or passages requested' });
      }
      
      console.log(`Admin ${req.session.user.username} requested simulation generation:`);
      console.log(`Users: ${numUsers}, Passages: ${numPassages}, Content: ${contentType}`);
      
      // Generate the fake data using HTTP registration for users and direct database creation for passages
      const useAIContent = contentType === 'ai';
      const includeImagesFlag = includeImages === true;
      const totalUsers = parseInt(numUsers);
      const totalPassages = parseInt(numPassages);
      
      console.log('Registering fake users via HTTP and creating passages directly in database...');
      
      // Generate fake users first using HTTP registration
      const createdUsers = [];
      for (let i = 0; i < totalUsers; i++) {
          console.log(`Registering fake user ${i + 1}/${totalUsers}...`);
          const fakeUserData = await fakeGenerator.registerFakeUser(domain);
          if (fakeUserData) {
              createdUsers.push(fakeUserData);
          } else {
              console.warn(`Failed to register fake user ${i + 1}, skipping...`);
          }
          // Small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      if (createdUsers.length === 0) {
          return res.status(500).json({ 
              error: 'Failed to create any fake users via HTTP registration',
              details: 'Check reCAPTCHA bypass or registration endpoint'
          });
      }
      
      console.log(`Successfully registered ${createdUsers.length} fake users via HTTP`);
      
      // Create passages for each user
      let createdPassagesCount = 0;
      const createdPassages = [];
      const passagesPerUser = Math.ceil(totalPassages / totalUsers);
      
      for (const userData of createdUsers) {
          for (let j = 0; j < passagesPerUser && createdPassagesCount < totalPassages; j++) {
              const passage = await createFakePassageDirectly(userData, useAIContent, includeImagesFlag);
              if (passage) {
                  createdPassagesCount++;
                  createdPassages.push(passage);
              }
          }
      }
      
      // Create sub-passages if includeSubContent is true
      let totalSubPassagesCreated = 0;
      if (includeSubContent === true && createdPassages.length > 0) {
          console.log('Creating sub-passages for main passages...');
          
          for (const passage of createdPassages) {
              const subPassages = await createFakeSubPassagesDirectly(passage, createdUsers, passage._id);
              totalSubPassagesCreated += subPassages.length;
          }
          
          console.log(`Created ${totalSubPassagesCreated} sub-passages`);
      }
      
      console.log(`Completed: Registered ${createdUsers.length} users via HTTP, created ${createdPassagesCount} passages, and ${totalSubPassagesCreated} sub-passages`);
      
      res.json({
          success: true,
          usersCreated: createdUsers.length,
          passagesCreated: createdPassagesCount,
          subPassagesCreated: totalSubPassagesCreated,
          message: 'Simulation data generated successfully using HTTP registration for users and direct database creation for passages'
      });
      
  } catch (error) {
      console.error('Error generating simulation data:', error);
      res.status(500).json({ 
          error: 'Failed to generate simulation data',
          details: error.message 
      });
  }
});

// Route to trigger the GCS upload process
app.get('/upload-to-gcs', requiresAdmin, async (req, res) => {
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
        uploadDirectoryToGCS(folderPath1, bucketName),
        uploadDirectoryToGCS(folderPath2, bucketName),
        uploadDirectoryToGCS(folderPath3, bucketName)
      ]);
      
      return res.send('Backup process completed successfully.');
    } catch (error) {
      console.error('Error uploading to GCS:', error);
      res.status(500).send('Upload failed: ' + error.message);
    }
  }
});

module.exports = router;