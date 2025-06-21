'use strict';

function getUploadFolder(passage){
    return passage.personal ? 'protected' : 'uploads';
}

module.exports = {
    getUploadFolder
};