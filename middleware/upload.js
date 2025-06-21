'use strict';

const fileUpload = require('express-fileupload');
const { getUploadFolder } = require('../utils/fileUtils');

// File upload middleware configuration

const uploadConfig = fileUpload({
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    abortOnLimit: true,
    responseOnLimit: "File size limit exceeded",
    createParentPath: true,
});

function validateFileType(allowedTypes) {
    return (req, res, next) => {
        if (req.files) {
            for (let key in req.files) {
                const file = req.files[key];
                const fileType = file.mimetype;
                
                if (!allowedTypes.includes(fileType)) {
                    return res.status(400).json({ 
                        error: `File type ${fileType} not allowed. Allowed types: ${allowedTypes.join(', ')}` 
                    });
                }
            }
        }
        next();
    };
}

function setUploadDestination(req, res, next) {
    if (req.files && req.body.passage) {
        // Use passage information to determine upload folder
        req.uploadFolder = getUploadFolder(req.body.passage);
    }
    next();
}

module.exports = {
    uploadConfig,
    validateFileType,
    setUploadDestination
};