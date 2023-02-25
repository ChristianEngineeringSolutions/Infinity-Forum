'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const rexSchema = mongoose.Schema({

});
module.exports = mongoose.model('Rex', rexSchema, 'Rex');