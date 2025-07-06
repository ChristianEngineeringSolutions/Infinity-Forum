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
                    await fsp.unlink(orig);
                    console.log("Removed original version of upload.");
                    //unlink _medium
                    await fsp.unlink(medium);
                    console.log("Removed medium version of upload.");
                    //unlink main file
                    await fsp.unlink(filePath);
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
    passage.medium = passage.medium || [];
    passage.compressed = passage.compressed || [];
    var filepath = partialpath + '/' + uploadTitle;
    // Get project root directory (remove /services from __dirname)
    const projectRoot = path.join(__dirname, '..');
    
    //change filename extension and mimetype if necessary (converted png to jpg)
    if(stdout.includes("pngconvert " + projectRoot + '/' +  filepath)){
        var pf = passage.filename[index].split('.'); //test.png
        passage.filename[index] = pf.slice(0, -1).join('.') + '.jpg'; //test.jpg
        console.log(passage.filename[index]);
    }
    
    //update database with medium if applicable
    if(stdout.includes("medium " + projectRoot + '/' + filepath)){
        console.log("PASSAGE.MEDIUM=TRUE");
        passage.medium[index] = 'true';
    }else{
        passage.medium[index] = 'false';
    }
    
    console.log("NODEJS FILEPATH: " + "medium " + projectRoot + '/' + filepath);
    console.log(stdout.includes("medium " + projectRoot + '/' + filepath));
    console.log(stdout.includes("medium"));
    
    //if error set compressed to false and use original filepath (no appendage)
    if(stdout.includes("error " + filepath)){
        passage.compressed[index] = 'false';
    }else{
        passage.compressed[index] = 'true';
        try{
            await fsp.unlink(projectRoot + '/' + filepath);
            console.log('Removed original upload');
        }catch(err2){
            console.log("Couldn't remove original upload.");
        }
    }
    
    passage.markModified('medium');
    passage.markModified('compressed');
    passage.markModified('filename');
    await passage.save();
}

// Upload file function
async function uploadFile(req, res, passage) {
    console.log("Upload Test");
    await deleteOldUploads(passage);
    var passages = await Passage.find({}).limit(20);
    var files = req.files;
    var fileToUpload = req.files.file;
    passage.filename = [];
    
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
        const where = passage.personal ? 'protected' : 'uploads';
        
        const fullpath = where === 'protected' ? './' + where : './dist/' + where;
        const partialpath = where === 'protected' ? where : 'dist/' + where;
        const simplepath = where;

        passage.filename[index] = uploadTitle;
        
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
                                        passage.filename[currentIndex] = newfilename;
                                        passage.markModified('filename');
                                        await passage.save();

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

                    if (mimeType.split('/')[0] === 'image' && mimeType.split('+')[0].split('/')[1] === 'svg') {
                        passage.isSVG = true;
                    } else {
                        passage.isSVG = false;
                    }

                    passage.mimeType[index] = mimeType.split('/')[0];
                    
                    if (passage.mimeType[index] === 'model' || passage.isSVG) {
                        const data = req.body.thumbnail.replace(/^data:image\/\w+;base64,/, "");
                        const buf = Buffer.from(data, 'base64');
                        await fsp.writeFile(fullpath + '/' + thumbnailTitle, buf);
                        passage.thumbnail = thumbnailTitle;
                    } else {
                        passage.thumbnail = null;
                    }

                    passage.markModified('filename');
                    passage.markModified('mimeType');
                    await passage.save();
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });

        index++;
    }
    
    await passage.save();
    console.log(passage.filename + "TEST");
}

// Update file function
async function updateFile(path, code) {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, code, function(err){
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
                var bash = 'bash ' + __dirname + 'restart.sh';
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
async function decodeDirectoryStructure(directory, location="./dist/filesystem"){
    //clear filesystem
    await fsp.rmdir('./dist/filesystem', {recursive: true, force: true});
    //regenerate
    await fsp.mkdir("./dist/filesystem");
    //add new directory
    await fsp.mkdir(location + '/' + directory.title);
    await fsp.writeFile(location + '/' + directory.title + '/index' + directory.ext, directory.code);
    
    for(const item of directory.contents){
        if(item instanceof Directory){
            await decodeDirectoryStructure(item, location + '/' + directory.title);
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
            await fsp.writeFile(location + '/' + directory.title + '/' + item.title + '.' + ext, item.code);
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