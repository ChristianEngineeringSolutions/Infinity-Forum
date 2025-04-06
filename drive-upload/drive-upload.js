const express = require('express');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

app.post('/generate-upload-url', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var secretKey = await fs.readFile('/etc/secrets/jwt-secret', 'utf8');
        const decoded = jwt.verify(token, secretKey, {
            clockTimestamp: Math.floor(Date.now() / 1000)
        });

        const fileName = req.body.fileName;
        const contentType = req.body.contentType;

        const [url] = await storage.bucket(req.body.bucketName).file(fileName).getSignedUrl({
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType: contentType,
        });
        const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
        const jti = Math.random().toString(36).substring(2, 15); // Generate unique JWT ID
        var finalToken = jwt.sign({ userId: req.session.user._id, jti: jti }, secretKey, {
                expiresIn: '15m', // Short expiration
                notBefore: now, // Token is not valid before the current time
            }); // Replace with your secret key

        res.json({ uploadUrl: url, secondJWT: finalToken});
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).send('Error generating signed URL.');
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});