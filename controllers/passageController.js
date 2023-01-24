"use strict";
const Passage = require('../models/Passage');
const Chapter = require('../models/Chapter');
//Call in Scripts
const scripts = require('../shared');
var fs = require('fs'); 

module.exports = {
    addPassage: function(options) {
        var post;
        if(options.chapter != '' && options.chapter != null){
            post = new Passage({
                content: options.content,
                chapter: options.chapter,
                sourceChapter: options.chapter,
                author: options.author,
                sourceAuthor: options.author,
                canvas: options.canvas,
                label: options.label,
                metadata: options.metadata,
                filename: options.filename,
                categories: options.categories
            }).save().then(data => {
                console.log(data);
                Chapter.findOne({_id:options.chapter}).exec(function(err, chap){
                    if(chap.passages){
                        chap.passages.push(data);
                    }
                    else{
                        chap.passages = [data];
                    }
                    chap.save();
                });
                options.callback(data);
            });
        }
        else{
            //level 1 sub passage
            if(options.parentPassage != '' && options.parentPassage != null){
                post = new Passage({
                    content: options.content,
                    author: options.author,
                    metadata: options.metadata,
                    canvas: options.canvas,
                    parent: options.parentPassage,
                    filename: options.filename,
                    categories: options.categories
                }).save()
                .then(data => {
                    Passage.findOne({_id:options.parentPassage}).exec(function(err, passage){
                        if(passage.passages){
                            passage.passages.push(data);
                        }
                        else{
                            passage.passages = [data];
                        }
                        passage.save();
                    });
                    options.callback(data);
                });
            }else{
                //level 1 passage
                post = new Passage({
                    content: options.content,
                    author: options.author,
                    sourceAuthor: options.author,
                    metadata: options.metadata,
                    canvas: options.canvas,
                    filename: options.filename,
                    categories: options.categories
                }).save()
                .then(data => {
                    options.callback(data);
                });
            }
            
        }
        //Do Passage Metadata functions
        //also need to do on update and delete
        for(let [key, value] of Object.entries(options.metadata)){
            switch(key){
                case 'Categories':
                //We need to create the category if it does not exist
                Category.find({title: new RegExp('^'+value+'$', "i")})
                .exec(function(cats){
                    //we need to create the Category
                    if(!cats){
                        Category.create({
                            title: value
                        }, function(err, cat){
                            cat.passages.push(post);
                            cat.save();
                        });
                    }
                    else{
                        cats.forEach(function(cat){
                            cat.passages.push(post);
                            cat.save();
                        });
                    }
                });
                break;
            }
        }
    },
    addPassageToCategory: function(passageID, chapterID, callback) {
        Chapter.find({_id:chapterID}).sort([['_id', 1]]).exec(function(err, chapter){
            chapter.passages.append(passageID);
            chapter.save().then((data) => {
                callback();
            });
        });
    },
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
    deletePassage: function(req, res, callback) {
        let passageID = req.body._id;
        //False deletion
        // Passage.findOne({_id: passageID.trim()}, function(err, passage){
        //     passage.deleted = true;
        //     passage.save();
        //     callback();
        // });
        //Real deletion
        Passage.findOneAndDelete({_id: passageID.trim()}, function(err, passage){
            if(passage.filename){
                fs.unlink('./dist/uploads/'+passage.filename, (err) => {
                    if (err) throw err;
                    console.log('./dist/uploads/'+passage.filename+' was deleted');
                });
            }
            callback();
        });
    },
    //deprecated; see copyPassage
    duplicatePassage: function(req, res, callback){
        //make a copy of the passage
        //but change the author
        var passage = new Passage(req.body.passage);
        passage.author = session.user;
        passage.chapter = req.body.chapter;
        //add source
        passage.save();
    },
    //move passage from one passage to another
    movePassage: async function(movingPassage, destinationPassage){
        movingPassage.parent = destinationPassage._id;
        destinationPassage.passages.push(movingPassage._id);
        await movingPassage.save();
        await destinationPassage.save();
    },
    copyPassage: async function(req, res, callback){
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
        //duplicate main passage
        let copy = await Passage.create({
            users: user,
            sourceList: sourceList,
            title: passage.title,
            content: passage.content,
            html: passage.html,
            css: passage.css,
            javascript: passage.javascript,
            editor: passage.editor
        });
        //copy children
        async function copyPassagesRecursively(passage, copy){
            let copySubPassages = [];
            passage.passages.forEach(async function(p){
                let sourceList = p.sourceList;
                sourceList.push(p._id);
                let pcopy = await Passage.create({
                    users: user,
                    sourceList: sourceList,
                    title: p.title,
                    content: p.content,
                    html: p.html,
                    css: p.css,
                    javascript: p.javascript,
                    editor: p.editor
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
        if(passage.passages){
            let result = await copyPassagesRecursively(passage, copy);
        }
        else{
            console.log('false');
        }
        console.log(result);
        res.render('passage', {passage: copy, sub: true});
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