"use strict";
const { Passage, PassageSchema } = require('../models/Passage');
//Call in Scripts
const scripts = {};
var fs = require('fs'); 

module.exports = {
    deletePassage: async function(req, res, callback) {
        let passageID = req.body._id;
        let passage = await Passage.findOne({_id: passageID});
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("Only passage author can delete.");
        }
        //delete uploads too
        for(const filename of passage.filename){
            //make sure no other passages are using the file
            var passages = await Passage.find({
                filename: {
                    $in: [filename]
                }
            });
            if(passages.length == 1){
                var where = passage.personal ? 'protected': 'uploads';
                fs.unlink('dist/'+where+'/'+filename, function(err){
                    if (err && err.code == 'ENOENT') {
                        // file doens't exist
                        console.info("File doesn't exist, won't remove it.");
                    } else if (err) {
                        // other errors, e.g. maybe we don't have enough permission
                        console.error("Error occurred while trying to remove file");
                    } else {
                        console.info(`removed upload for deleted passage`);
                    }
                });
            }
        }
        await Passage.deleteOne({_id: passageID.trim()});
        callback();
        // async function deleteRecursively(passage, arrToDelete){
        //     var arrToDelete = [];
        //     //delete uploads too
        //     for(const filename of passage.filename){
        //         //make sure no other passages are using the file
        //         var passages = await Passage.find({
        //             filename: {
        //                 $in: [filename]
        //             }
        //         });
        //         if(passages.length == 1){
        //             var where = passage.personal ? 'protected': 'uploads';
        //             fs.unlink('dist/'+where+'/'+filename, function(err){
        //                 if (err && err.code == 'ENOENT') {
        //                     // file doens't exist
        //                     console.info("File doesn't exist, won't remove it.");
        //                 } else if (err) {
        //                     // other errors, e.g. maybe we don't have enough permission
        //                     console.error("Error occurred while trying to remove file");
        //                 } else {
        //                     console.info(`removed upload for deleted passage`);
        //                 }
        //             });
        //         }
        //     }
        //     for(const p of passage.passages){
        //         arrToDelete.push(p._id);
        //         deleteRecursively(p, arrToDelete);
        //     }
        //     for(const p of arrToDelete){
        //         await Passage.deleteOne({_id: p._id()});
        //     }
        //     await Passage.deleteOne({_id: passage._id()});
        // }
    },
    copyPassage: async function(passage, user, parent, callback, synthetic=false, comment=false){
        //add source
        let sourceList = passage.sourceList;
        sourceList.push(passage._id);
        if(passage.showBestOf){
            var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
            copy.best = best;
        }
        //duplicate main passage
        let copy = await Passage.create({
            parent: parent,
            author: user[0],
            users: user,
            sourceList: sourceList,
            title: passage.title,
            content: passage.content,
            html: passage.html,
            css: passage.css,
            javascript: passage.javascript,
            filename: passage.filename,
            code: passage.code,
            lang: passage.lang,
            isSVG: passage.isSVG,
            license: passage.license,
            mimeType: passage.mimeType,
            thumbnail: passage.thumbnail,
            metadata: passage.metadata,
            sourceLink: passage.sourceLink,
            personal: passage.personal,
            synthetic: synthetic,
            mirror: passage.mirror,
            bestOf: passage.bestOf,
            mirrorEntire: passage.mirrorEntire,
            mirrorContent: passage.mirrorContent,
            bestOfEntire: passage.bestOfEntire,
            bestOfContent: passage.bestOfContent,
            comment: comment
        });
        //Add copy to passage it was duplicated into
        if(parent != "root" && parent != null){
            let parentPassage = await Passage.findOne({_id: parent});
            copy.parent = parentPassage;
            parentPassage.passages.push(copy);
            await copy.save();
            await parentPassage.save();
        }
        //copy children
        async function copyPassagesRecursively(passage, copy){
            let copySubPassages = [];
            //copy children
            if(!passage.public && !passage.forum){
                for(const p of passage.passages){
                    let sourceList = p.sourceList;
                    sourceList.push(p._id);
                    let pcopy = await Passage.create({
                        author: user[0],
                        users: user,
                        parent: copy,
                        sourceList: sourceList,
                        title: p.title,
                        content: p.content,
                        html: p.html,
                        css: p.css,
                        javascript: p.javascript,
                        filename: p.filename,
                        code: p.code,
                        lang: p.lang,
                        isSVG: p.isSVG,
                        license: p.license,
                        mimeType: p.mimeType,
                        thumbnail: p.thumbnail,
                        metadata: p.metadata,
                        sourceLink: p.sourceLink,
                        synthetic: synthetic,
                        personal: p.personal
                    });
                    copy.passages.push(pcopy._id);
                    await copy.save();
                    //copy children's children
                    if(p.passages && !p.public && !p.forum){
                        await copyPassagesRecursively(p, pcopy);
                    }
                }
            }
            // console.log(copy.title);
            let update = await Passage.findOneAndUpdate({_id: copy._id}, {
                passages: copy.passages
            }, {
                new: true
            });
            let check = await Passage.findOne({_id: copy._id});
            return update;
            // console.log(done.title + '\n' + done.passages[0]);
        }
        let result = '';
        if(passage.passages.length >= 1){
            let result = await copyPassagesRecursively(passage, copy);
        }
        else{
            console.log('false');
        }
        let ret = await Passage.findOne({_id: copy._id}).populate('parent author users sourceList subforums collaborators versions mirror bestOf best');
        return ret;
        // res.render('passage', {passage: copy, sub: true});
    },
}