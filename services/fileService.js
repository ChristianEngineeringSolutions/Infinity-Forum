'use strict';

const { Passage } = require('../models/Passage');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { v4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');

// Extension list from sasame.js
const extList = {
    'python' : '.py',
    'javascript' : '.js',
    'css' : '.css',
    'mixed' : '.html',
    'bash': '.sh',
    'ejs': '.ejs',
    'markdown': '.md',
    'rich': '.default',
    'text': '.txt'
};

// Get file extension based on language
function getExt(lang){
    return extList[lang].toString();
}

// Directory class for file structure
class Directory {
    constructor(passage){
        this.title = encodeURIComponent(passage.title);
        this.code = passage.code || '';
        this.contents = [];
        this.ext = getExt(passage.lang);
    }
}

// File class for file structure
class File {
    constructor(passage){
        this.title = encodeURIComponent(passage.title);
        this.code = passage.code || '';
        this.ext = getExt(passage.lang);
    }
}

// Delete old upload files
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
                var filePath = path.join(__dirname, '../dist', where, f);
            }
            else{
                var filePath = path.join(__dirname, '../protected', f);
            }
            console.log("FILEPATH TO UNLINK:" + passage.filename);
            try{
                if(passage.filename.length > 0){
                    var splitPath = filePath.split('.');
                    var firstPart = splitPath.slice(0, -1).join('.');
                    var ext = splitPath.at(-1);
                    var orig = firstPart + '_orig.' + ext;
                    var medium = firstPart + '_medium.' + ext;
                    //unlink _orig
                    try{
                        await fsp.unlink(orig);
                    }catch(e){
                        console.log(e);
                    }
                    console.log("Removed original version of upload.");
                    //unlink _medium
                    try{
                        await fsp.unlink(medium);
                    }catch(e){
                        console.log(e);
                    }
                    console.log("Removed medium version of upload.");
                    //unlink main file
                    try{
                        await fsp.unlink(filePath);
                    }catch(e){
                        console.log(e);
                    }
                    console.log("Removed main upload.");
                }
            }catch(e){
                console.log("Error deleting upload: " + e);
            }
        }
        index++;
    }
}

// Handle image compression results
async function handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index){
    console.log(err);
    console.log(stdout);
    console.log(stderr);
    console.log("=Ok actually finished compressing img");
    
    // Initialize arrays if needed (for atomic update)
    const medium = passage.medium || [];
    const compressed = passage.compressed || [];
    const filename = [...passage.filename];
    
    var filepath = partialpath + '/' + uploadTitle;
    // Get project root directory (remove /services from __dirname)
    const projectRoot = path.join(__dirname, '..');
    
    // Prepare update data
    const updateData = {};
    
    //change filename extension and mimetype if necessary (converted png to jpg)
    if(stdout.includes("pngconvert " + projectRoot + '/' +  filepath)){
        var pf = passage.filename[index].split('.'); //test.png
        filename[index] = pf.slice(0, -1).join('.') + '.jpg'; //test.jpg
        console.log(filename[index]);
        updateData[`filename.${index}`] = filename[index];
    }
    
    //update database with medium if applicable
    if(stdout.includes("medium " + projectRoot + '/' + filepath)){
        console.log("PASSAGE.MEDIUM=TRUE");
        medium[index] = 'true';
    }else{
        medium[index] = 'false';
    }
    updateData[`medium.${index}`] = medium[index];
    
    console.log("NODEJS FILEPATH: " + "medium " + projectRoot + '/' + filepath);
    console.log(stdout.includes("medium " + projectRoot + '/' + filepath));
    console.log(stdout.includes("medium"));
    
    //if error set compressed to false and use original filepath (no appendage)
    if(stdout.includes("error " + filepath)){
        compressed[index] = 'false';
    }else{
        compressed[index] = 'true';
        try{
            await fsp.unlink(projectRoot + '/' + filepath);
            console.log('Removed original upload');
        }catch(err2){
            console.log("Couldn't remove original upload.");
        }
    }
    updateData[`compressed.${index}`] = compressed[index];
    
    // Perform atomic update
    await Passage.updateOne(
        { _id: passage._id },
        { $set: updateData }
    );
    
    // Update the passage object to reflect changes (for use in uploadFile)
    if(updateData[`filename.${index}`]) {
        passage.filename[index] = updateData[`filename.${index}`];
    }
    passage.medium = medium;
    passage.compressed = compressed;
}

// Upload file function
async function uploadFile(req, res, passage) {
    const checkDiskSpace = require('check-disk-space');
    const DISK_SPACE_LIMIT_PERCENT = 90;
    const diskSpace = await checkDiskSpace('/');
    //calculate the percentage of used space
    const usedSpace = diskSpace.size - diskSpace.free;
    const usedPercentage = (usedSpace / diskSpace.size) * 100;
    if(usedPercentage > DISK_SPACE_LIMIT_PERCENT){
        return res.send('Server disk space is full. Please try again later.');
    }
    console.log("Upload Test");
    await deleteOldUploads(passage);
    var passages = await Passage.find({}).limit(20);
    var files = req.files;
    var fileToUpload = req.files.file;
    
    // Initialize arrays for atomic updates
    const filenames = [];
    const mimeTypes = passage.mimeType || [];
    
    if (!Array.isArray(fileToUpload)) {
        fileToUpload = [fileToUpload];
    }

    //Check file sizes
    for(const file of fileToUpload){
        const mimeType = file.mimetype;
        // Check if the file is an image and its size exceeds 20MB (20 * 1024 * 1024 bytes)
        if (mimeType.startsWith('image/') && file.size > 20 * 1024 * 1024) {
            console.log(`Image "${file.name}" exceeds the 20MB limit.`);
            return res.send(`Image "${file.name}" is too large (max 20MB).`);
        }
        // Check if the file is an image and its size exceeds 250MB (250 * 1024 * 1024 bytes)
        if (mimeType.startsWith('video/') && file.size > 250 * 1024 * 1024) {
            console.log(`Video "${file.name}" exceeds the 250MB limit.`);
            return res.send(`Video "${file.name}" is too large (max 250MB).`);
        }
        else{
            // File has 250MB (250 * 1024 * 1024 bytes) limit
            if (file.size > 250 * 1024 * 1024) {
                console.log(`File "${file.name}" exceeds the 250MB limit.`);
                return res.send(`File "${file.name}" is too large (max 250MB).`);
            }
        }
    }

    // Process files sequentially using for...of loop
    let index = 0;
    for (const file of fileToUpload) {
        const mimeType = file.mimetype;
        const uploadTitle = file.name.split('.')[0] + '_' + v4() + "." + file.name.split('.').at(-1);
        const thumbnailTitle = v4() + ".jpg";
        const where = (passage.personal || passage.team || passage.teamForRoot) ? 'protected' : 'uploads';
        
        // Adjust paths for new location in services directory
        const projectRoot = path.join(__dirname, '..');
        const fullpath = where === 'protected' ? 
            path.join(projectRoot, where) : 
            path.join(projectRoot, 'dist', where);
        const partialpath = where === 'protected' ? where : 'dist/' + where;
        const simplepath = where;

        filenames[index] = uploadTitle;
        
        // Wrap mv() in a Promise
        await new Promise((resolve, reject) => {
            file.mv(fullpath + '/' + uploadTitle, async (err) => {
                if (err) {
                    console.log("DID NOT MOVE FILE");
                    reject(err);
                    return;
                }
                
                console.log("MOVED FILE");
                
                try {
                    if (mimeType.split('/')[0] === 'image') {
                        await new Promise((resolveCompress) => {
                            // exec runs from project root, not from services directory
                            exec('python3 compress.py "' + partialpath + '/' + uploadTitle + '" ' + 
                                 mimeType.split('/')[1] + ' ' + passage._id,
                                async (err, stdout, stderr) => {
                                    await handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index);
                                    resolveCompress();
                                }
                            );
                        });
                    }

                    const newfilename = uploadTitle.split('.')[0] + '_c.' + uploadTitle.split('.')[1];
                    
                    if (mimeType.split('/')[0] === 'video') {
                        console.log("Beginning video processing for index:", index);
                        const ext = newfilename.split('.').at(-1);
                        let cmd = '';
                        
                        switch(ext) {
                            case 'webm':
                                cmd = `ffmpeg -i ${partialpath}/${uploadTitle} -c:v libvpx -crf 18 -preset veryslow -c:a copy ${partialpath}/${newfilename}`;
                                break;
                            default:
                                cmd = `ffmpeg -i ${partialpath}/${uploadTitle} ${partialpath}/${newfilename}`;
                                break;
                        }

                        console.log("Executing command:", cmd);
                        
                        try {
                            await new Promise((resolveVideo, rejectVideo) => {
                                const currentIndex = index; // Capture current index
                                const process = exec(cmd, async (err, stdout, stderr) => {
                                    if (err) {
                                        console.error("Error in video processing:", err);
                                        rejectVideo(err);
                                        return;
                                    }
                                    
                                    console.log('Video compressed. Index:', currentIndex, 'File:', newfilename);
                                    console.log('STDOUT:', stdout);
                                    console.log('STDERR:', stderr);
                                    
                                    try {
                                        // Update filename atomically
                                        await Passage.updateOne(
                                            { _id: passage._id },
                                            { $set: { [`filename.${currentIndex}`]: newfilename } }
                                        );
                                        filenames[currentIndex] = newfilename;

                                        if (newfilename !== uploadTitle) {
                                            await new Promise((resolveUnlink) => {
                                                fs.unlink(partialpath + '/' + uploadTitle, (err) => {
                                                    if (err && err.code === 'ENOENT') {
                                                        console.info("File doesn't exist, won't remove it.");
                                                    } else if (err) {
                                                        console.error("Error occurred while trying to remove file:", err);
                                                    } else {
                                                        console.info(`Removed original video file for index ${currentIndex}`);
                                                    }
                                                    resolveUnlink();
                                                });
                                            });
                                        }
                                        resolveVideo();
                                    } catch (error) {
                                        console.error("Error in post-processing:", error);
                                        rejectVideo(error);
                                    }
                                });

                                // Add error handler for the exec process itself
                                process.on('error', (error) => {
                                    console.error("Exec process error:", error);
                                    rejectVideo(error);
                                });
                            });
                        } catch (error) {
                            console.error("Video processing failed:", error);
                            throw error; // Propagate error to main try-catch block
                        }
                    }

                    const isSVG = (mimeType.split('/')[0] === 'image' && mimeType.split('+')[0].split('/')[1] === 'svg');
                    mimeTypes[index] = mimeType.split('/')[0];
                    
                    // Prepare update data for this iteration
                    const iterationUpdate = {
                        [`mimeType.${index}`]: mimeTypes[index],
                        isSVG: isSVG
                    };
                    
                    if (mimeTypes[index] === 'model' || isSVG) {
                        const data = req.body.thumbnail.replace(/^data:image\/\w+;base64,/, "");
                        const buf = Buffer.from(data, 'base64');
                        await fsp.writeFile(fullpath + '/' + thumbnailTitle, buf);
                        iterationUpdate.thumbnail = thumbnailTitle;
                    } else {
                        iterationUpdate.thumbnail = null;
                    }
                    
                    // Update atomically for this file
                    await Passage.updateOne(
                        { _id: passage._id },
                        { $set: iterationUpdate }
                    );
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });

        index++;
    }
    
    // Final atomic update with all filenames
    await Passage.updateOne(
        { _id: passage._id },
        { $set: { filename: filenames } }
    );
    
    // Update passage object to reflect changes
    passage.filename = filenames;
    passage.mimeType = mimeTypes;
    
    console.log(filenames + "TEST");
}

// Update file function
async function updateFile(filePath, code) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, code, function(err){
            if (err) {
                console.log(err);
                reject(err);
                return;
            }
            
            //restart server to apply changes on remote environments
            if(process.env.REMOTE){
                var shell = require('shelljs');
                //in sudo visudo
                //user ALL = NOPASSWD: /home/user/Infinity-Forum/restart.sh
                var bash = 'bash ' + path.join(__dirname, '..', 'restart.sh');
                shell.exec(bash, function(code, output) {
                    console.log('Exit code:', code);
                    console.log('Program output:', output);
                });
            }
            
            resolve();
        });
    });
}

// Get directory structure function
function getDirectoryStructure(passage){
    var directory = new Directory(passage);
    // populate directory recursively
    (function lambda(passages, directory){
        for(const p of passages){
            if(p.passages.length > 0){
                let dir = new Directory(p);
                directory.contents.push(dir);
                lambda(p.passages, dir);
            }
            else{
                let file = new File(p);
                directory.contents.push(file);
            }
        }
    })(passage.passages, directory);
    return directory;
}

// Decode directory structure function
async function decodeDirectoryStructure(directory, location){
    // Set default location to dist/filesystem relative to project root
    if (!location) {
        location = path.join(__dirname, '..', 'dist', 'filesystem');
    }
    
    //clear filesystem
    const filesystemPath = path.join(__dirname, '..', 'dist', 'filesystem');
    await fsp.rmdir(filesystemPath, {recursive: true, force: true});
    //regenerate
    await fsp.mkdir(filesystemPath);
    //add new directory
    await fsp.mkdir(path.join(location, directory.title));
    await fsp.writeFile(path.join(location, directory.title, 'index' + directory.ext), directory.code);
    
    for(const item of directory.contents){
        if(item instanceof Directory){
            await decodeDirectoryStructure(item, path.join(location, directory.title));
        }
        else if(item instanceof File){
            var ext = item.ext;
            if(ext == 'mixed'){
                item.code = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="X-UA-Compatible" content="IE=edge">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${item.title}</title>
                    <style>${item.css}</style>
                    <script src="/jquery.min.js"></script>
                </head>
                <body>
                    <%-${item.html}%>
                    <script>${item.javascript}</script>
                </body>
                </html>
                `;
                ext = 'html';
            }
            await fsp.writeFile(path.join(location, directory.title, item.title + '.' + ext), item.code);
        }
    }
}

module.exports = {
    deleteOldUploads,
    uploadFile,
    updateFile,
    getDirectoryStructure,
    decodeDirectoryStructure
};