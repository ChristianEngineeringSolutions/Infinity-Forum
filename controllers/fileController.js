'use strict';

const { Passage } = require('../models/Passage');
const fs = require('fs');
const fsp = require('fs').promises;

async function deleteOldUploads(passage){
    var where = passage.personal ? 'protected' : 'uploads';
    var index = 0;
    for(const f of passage.filename){
        console.log(f);
        var passages = await Passage.find({
            filename: {
                $in: [f]
            }
        });
        if(passages.length == 1){
            if(where == 'uploads'){
                var path = './dist/'+where+'/'+f;
            }
            else{
                var path = './protected/'+f;
            }
            console.log("FILEPATH TO UNLINK:" + passage.filename);
            try{
                if(passage.filename.length > 0){
                    // await fsp.unlink(path); //deprecated
                    var splitPath = path.split('.');
                    var firstPart = splitPath.slice(0, -1).join('.');
                    var ext = splitPath.at(-1);
                    var orig = firstPart + '_orig.' + ext;
                    var medium = firstPart + '_medium.' + ext;
                    //unlink _orig
                    await fsp.unlink(orig);
                    console.log("Removed original version of upload.");
                    //unlink _medium
                    await fsp.unlink(medium);
                    console.log("Removed medium version of upload.");
                    //unlink main file
                    await fsp.unlink(path);
                    console.log("Removed main upload.");
                }
            }catch(e){
                console.log("Error deleting upload: " + e);
            }
        }
        index++;
    }
}

async function uploadFile(req, res, passage) {
    // Implementation to be extracted from sasame.js
    console.log("Upload file functionality not implemented yet");
}

// Update file function (from sasame.js)
async function updateFile(path, code) {
    // Implementation to be extracted from sasame.js
    console.log("Update file functionality not implemented yet");
}

// Get directory structure function (from sasame.js)
function getDirectoryStructure(passage) {
    // Implementation to be extracted from sasame.js
    return {};
}

// Decode directory structure function (from sasame.js)
async function decodeDirectoryStructure(directory) {
    // Implementation to be extracted from sasame.js
    console.log("Decode directory structure functionality not implemented yet");
}

module.exports = {
    deleteOldUploads,
    uploadFile,
    updateFile,
    getDirectoryStructure,
    decodeDirectoryStructure
};