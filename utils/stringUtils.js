'use strict';

//function from string-similarity-js
//since i was having import issues
var stringSimilarity = function (str1, str2, substringLength, caseSensitive) {
    if (substringLength === void 0) { substringLength = 2; }
    if (caseSensitive === void 0) { caseSensitive = false; }
    if (!caseSensitive) {
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();
    }
    if (str1.length < substringLength || str2.length < substringLength)
        return 0;
    var map = new Map();
    for (var i = 0; i < str1.length - (substringLength - 1); i++) {
        var substr1 = str1.substr(i, substringLength);
        map.set(substr1, map.has(substr1) ? map.get(substr1) + 1 : 1);
    }
    var match = 0;
    for (var j = 0; j < str2.length - (substringLength - 1); j++) {
        var substr2 = str2.substr(j, substringLength);
        var count = map.has(substr2) ? map.get(substr2) : 0;
        if (count > 0) {
            map.set(substr2, count - 1);
            match++;
        }
    }
    return (match * 2) / (str1.length + str2.length - ((substringLength - 1) * 2));
};

function passageSimilarity(passage, source){
    if(passage.lang == source.lang){
        if(passage.lang == 'rich'){
            return stringSimilarity(passage.content, source.content);
        }
        else if(passage.lang == 'mixed'){
            return stringSimilarity(passage.html + passage.css + passage.javascript, source.html + source.css + source.javascript);
        }
        else{
            return stringSimilarity(passage.code, source.code);
        }
    }
}

function overlaps(arr1, arr2) {
  if (!arr1.length || !arr2.length) {
    return false; // Handle empty arrays
  }
  const set1 = new Set(arr1);
  return arr2.some(element => set1.has(element));
}

module.exports = {
    stringSimilarity,
    passageSimilarity,
    overlaps
};