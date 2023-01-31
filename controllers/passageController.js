"use strict";
const Passage = require('../models/Passage');
const Chapter = require('../models/Chapter');
//Call in Scripts
const scripts = {};
var fs = require('fs'); 

module.exports = {
    updatePassage: function(options) {
        Passage.findOneAndUpdate({_id: options.id.trim()}, {
            content: options.content,
            canvas: options.canvas,
            label: options.label,
            metadata: options.metadata,
            categories: options.categories
        }, {new: true}, function(err, doc){
            if(err){
                console.log(err);
            }
            options.callback(doc);
        });
    },
    updatePassageContent: function(req, res, callback) {
        var passageID = req.body._id;
        var content = req.body.content || '';
        Passage.updateOne({_id: passageID.trim()}, {
            content: content,
        }, function(err, affected, resp){
            if(err){
                console.log(err);
            }
            callback();
        });
    },
    deletePassage: async function(req, res, callback) {
        let passageID = req.body._id;
        await Passage.deleteOne({_id: passageID.trim()});
        callback();
    },
    //move passage from one passage to another
    movePassage: async function(movingPassage, destinationPassage){
        let oldParent = await Passage.findOne({_id: movingPassage.parent._id});
        oldParent.passages.forEach(function(p, i){
            if(p._id == movingPassage._id){
                oldParent.passages.splice(i, 1);
            }
        });
        await oldParent.save();
        movingPassage.parent = destinationPassage._id;
        destinationPassage.passages.push(movingPassage._id);
        await movingPassage.save();
        await destinationPassage.save();
    },
    copyPassage: async function(req, res, callback){
        console.log('copied');
        //get passage to copy
        let user;
        let passage = await Passage.findOne({_id: req.body._id});
        //reset author list
        if (typeof req.session.user === 'undefined' || req.session.user === null) {
            user = null;
        }
        else{
            user = [req.session.user];
        }
        //add source
        let sourceList = passage.sourceList;
        sourceList.push(passage._id);
        var parent = req.body.parent == 'root' ? null : req.body.parent;
        //duplicate main passage
        let copy = await Passage.create({
            parent: parent,
            author: req.session.user,
            users: user,
            sourceList: sourceList,
            title: passage.title,
            content: passage.content,
            html: passage.html,
            css: passage.css,
            javascript: passage.javascript,
            filename: passage.filename
        });
        //Add copy to passage it was duplicated into
        if(req.body.parent != "root"){
            let parentPassage = await Passage.findOne({_id: req.body.parent});
            copy.parent = parentPassage;
            parentPassage.passages.push(copy);
            copy.save();
            parentPassage.save();
        }
        //copy children
        async function copyPassagesRecursively(passage, copy){
            let copySubPassages = [];
            passage.passages.forEach(async function(p){
                let sourceList = p.sourceList;
                sourceList.push(p._id);
                let pcopy = await Passage.create({
                    users: user,
                    parent: copy,
                    sourceList: sourceList,
                    title: p.title,
                    content: p.content,
                    html: p.html,
                    css: p.css,
                    javascript: p.javascript,
                    filename: p.filename
                });
                copy.passages.push(pcopy._id);
                await copy.save();
                if(p.passages){
                    await copyPassagesRecursively(p, pcopy);
                }
            });
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
            console.log(passage.passages);
            console.log('test');
            let result = await copyPassagesRecursively(passage, copy);
        }
        else{
            console.log('false');
        }
        console.log(result);
        let ret = await Passage.findOne({_id: copy._id}).populate('author');
        return ret;
        // res.render('passage', {passage: copy, sub: true});
    },
    //update order of sub-passages in passage
    updatePassageOrder: async function(req, res, callback) {
        var passageId = req.body.passageId;
        var passages = JSON.parse(req.body.passages);
        let trimmedPassages = passages.map(str => str.trim());
        let passage = await Passage.updateOne({_id: passageId.trim()}, {
            passages: trimmedPassages,
        });
        res.send("Done");
    },
}