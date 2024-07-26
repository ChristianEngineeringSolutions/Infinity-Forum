const { parentPort, workerData } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const { exec } = require('child_process');
require('dotenv').config();

async function processFiles(passageId, filenames, where, mimetypes) {
    const results = await Promise.all(filenames.map(async (filename, index) => {
        const filePath = path.join('./dist', where, filename);
        const mimetype = mimetypes[index];

        if (mimetype.startsWith('image')) {
            try {
                const { stdout, stderr } = await exec(`python3 compress.py ${filePath} ${mimetype.split('/')[1]}`);
                console.log(stdout, stderr);
            } catch (error) {
                console.error('Error compressing image:', error);
            }
        }

        const nsfwResult = await checkNSFW(mimetype, where, filename);

        let thumbnail = null;
        if (mimetype.startsWith('model') || (mimetype.startsWith('image') && mimetype.includes('svg'))) {
            thumbnail = await generateThumbnail(filePath, where);
        }

        return {
            mimeType: mimetype.split('/')[0],
            isPorn: nsfwResult.isPorn,
            isHentai: nsfwResult.isHentai,
            isSVG: mimetype.startsWith('image') && mimetype.includes('svg'),
            thumbnail
        };
    }));

    // Update passage in database
    await mongoose.model('Passage').findOneAndUpdate(
        { _id: passageId },
        { 
            $set: {
                mimeType: results.map(r => r.mimeType),
                isPorn: results.map(r => r.isPorn),
                isHentai: results.map(r => r.isHentai),
                isSVG: results.some(r => r.isSVG),
                thumbnail: results.find(r => r.thumbnail)?.thumbnail || null,
                flagged: results.some(r => r.isPorn > 0.5 || r.isHentai > 0.5)
            }
        },
        { runValidators: true }
    );

    console.log('Background processing completed for passage:', passageId);
}

async function checkNSFW(mimeType, where, uploadTitle) {
    const result = { isPorn: 0, isHentai: 0, flagged: false };
    const model = await nsfw.load();

    if (mimeType.startsWith('image')) {
        const pic = await axios.get(`http://localhost:3000/${where}/${uploadTitle}`, { responseType: "arraybuffer" });
        const image = await tf.node.decodeImage(pic.data, 3);
        const predictions = await model.classify(image);
        image.dispose();
        console.log(predictions);
        result.isPorn = predictions[3].probability;
        result.isHentai = predictions[4].probability;
    } else if (mimeType.startsWith('video')) {
        const screenshotName = uuidv4();
        await takeScreenshots(where, uploadTitle, screenshotName);
        for (let t = 0; t < 2; t++) {
            const screenshotPath = path.join('dist', where, `${screenshotName}_${t}.png`);
            const pic = await axios.get(`http://localhost:3000/${where}/${screenshotName}_${t}.png`, { responseType: "arraybuffer" });
            const image = await tf.node.decodeImage(pic.data, 3);
            const predictions = await model.classify(image);
            image.dispose();

            result.isPorn = Math.max(result.isPorn, predictions[3].probability);
            result.isHentai = Math.max(result.isHentai, predictions[4].probability);
            await fs.unlink(screenshotPath);
        }
    }

    result.flagged = result.isPorn > 0.5 || result.isHentai > 0.5;
    return result;
}

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_CONNECTION_URL);
        const { passageId, filenames, where, mimetypes } = workerData;
        await processFiles(passageId, filenames, where, mimetypes);
    } catch (error) {
        console.error('Error in worker:', error);
    } finally {
        await mongoose.disconnect();
    }
}

main();