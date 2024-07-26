(async function(){
  const mongoose = require('mongoose');
  require('dotenv').config();
  mongoose.connect(process.env.MONGODB_CONNECTION_URL, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true
  });
  const User = require('./models/User');
  const Passage = require('./models/Passage');
  const axios = require("axios"); //you can use any http client
  const tf = require("@tensorflow/tfjs-node");
  const nsfw = require("nsfwjs");
  var fs = require('fs'); 
  // var request = require('request').defaults({ encoding: null });
  if(process.argv[5] == 'image'){
    const pic = await axios.get('http://localhost:3000/'+process.argv[2], {
      responseType: "arraybuffer",
    });
    const model = await nsfw.load(); // To load a local model, nsfw.load('file://./path/to/model/')
    // Image must be in tf.tensor3d format
    // you can convert image to tf.tensor3d with tf.node.decodeImage(Uint8Array,channels)
    const image = await tf.node.decodeImage(pic.data, 3);
    const predictions = await model.classify(image);
    image.dispose(); // Tensor memory must be managed explicitly (it is not sufficient to let a tf.Tensor go out of scope for its memory to be released).
    console.log(predictions);
    console.log("_ID: " + process.argv[4]);
    var passage = await Passage.findOne({_id: process.argv[4].toString()});
    passage.isPorn = predictions[3].probability;
    passage.isHentai[0] = predictions[4].probability;
    if(passage.isPorn[0] > 0.6 || passage.isHentai[0] > 0.6){
      passage.flagged = true;
    }
  }else if(process.argv[5] == 'video'){
    //process each screenshot
    for(var i = 1; i <= 3; ++i){
      var pic = await axios.get('http://localhost:3000/'+ process.argv[3] + '/' + process.argv[6] + '_' + i + '.png', {
        responseType: "arraybuffer",
      });
      const model = await nsfw.load(); // To load a local model, nsfw.load('file://./path/to/model/')
      // Image must be in tf.tensor3d format
      // you can convert image to tf.tensor3d with tf.node.decodeImage(Uint8Array,channels)
      const image = await tf.node.decodeImage(pic.data, 3);
      const predictions = await model.classify(image);
      image.dispose(); // Tensor memory must be managed explicitly (it is not sufficient to let a tf.Tensor go out of scope for its memory to be released).
      console.log(predictions);
      var passage = await Passage.findOne({_id: process.argv[4].toString()});
      passage.isPorn = predictions[3].probability;
      passage.isHentai[0] = predictions[4].probability;
      if(passage.isPorn[0] > 0.6 || passage.isHentai[0] > 0.6){
        passage.flagged = true;
        break;
      }
    }
  }
    //delete flagged media
    if(passage.flagged){
        fs.unlink('dist/'+process.argv[2], function(err){
          if (err && err.code == 'ENOENT') {
              // file doens't exist
              console.info("File doesn't exist, won't remove it.");
          } else if (err) {
              // other errors, e.g. maybe we don't have enough permission
              console.error("Error occurred while trying to remove file");
          } else {
              console.info(`removed flagged media.`);
          }
      });
    }
    // await Passage.findOneAndUpdate({_id:process.argv[4]}, {flagged: passage.flagged});
    // await passage.save();
    console.log("Done.");
})();