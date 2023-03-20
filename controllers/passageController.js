"use strict";
const Passage = require('../models/Passage');
//Call in Scripts
const scripts = {};
var fs = require('fs'); 

module.exports = {
    deletePassage: async function(req, res, callback) {
        let passageID = req.body._id;
        let passage = await Passage.findOne({_id: passageID});
        if(passage.author.toString() != req.session.user._id.toString()){
            res.send("Only passage author can delete.");
        }
        await Passage.deleteOne({_id: passageID.trim()});
        callback();
    },
    copyPassage: async function(passage, user, parent, callback, synthetic=false){
        //add source
        let sourceList = passage.sourceList;
        sourceList.push(passage._id);
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
            synthetic: synthetic
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
                if(p.passages){
                    await copyPassagesRecursively(p, pcopy);
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
        let ret = await Passage.findOne({_id: copy._id}).populate('author users sourceList');
        return ret;
        // res.render('passage', {passage: copy, sub: true});
    },
}