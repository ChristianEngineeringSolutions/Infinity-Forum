const express = require('express');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

app.get('/test-jwt', async (req, res) => {
  try {
    const secretKey = await fs.readFile('/etc/secrets/jwt-secret', 'utf8');
    
    // Create a test token right on the server
    const testToken = jwt.sign({ type: 'test' }, secretKey, {
      expiresIn: '1h'
    });
    
    // Immediately verify the token
    try {
      const decoded = jwt.verify(testToken, secretKey);
      res.json({
        success: true,
        token: testToken,
        decoded: decoded,
        secretLength: secretKey.length
      });
    } catch (verifyError) {
      res.status(500).json({
        success: false,
        error: 'Verification failed',
        message: verifyError.message,
        secretLength: secretKey.length
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Test failed',
      message: error.message
    });
  }
});

app.post('/generate-bulk-upload-urls', async (req, res) => {
    const secretKey = (await fs.readFile('/etc/secrets/jwt-secret', 'utf8')).trim();
    try {
        // const token = req.headers.authorization.split(' ')[1];
        // const decodedBackupToken = jwt.verify(token, secretKey, {
        //     clockTimestamp: Math.floor(Date.now() / 1000)
        // });

            const token = req.headers.authorization.split(' ')[1];
            console.log("Token to verify:", token);
            let decoded;
            const cloudRunCurrentTime = Math.floor(Date.now() / 1000);
            console.log("Cloud Run current time (UTC):", cloudRunCurrentTime);
            try {
              decoded = jwt.decode(token);
              console.log("Cloud Run nbf from token (UTC):", decoded.nbf);
              console.log("Token structure (decoded):", decoded);
            } catch (decodeError) {
              console.error("Failed to decode token:", decodeError);
            }
            
            try {
              const decodedBackupToken = jwt.verify(token, secretKey, {clockTimestamp: cloudRunCurrentTime});
              console.log("Verification succeeded:", decodedBackupToken);
              // Rest of your code...
              if (decodedBackupToken.type !== 'backup') {
                    return res.status(403).send('Forbidden: Invalid token type for backup.');
                }

                const files = req.body.files;
                if (!Array.isArray(files)) {
                    return res.status(400).send('Bad Request: Expected an array of files.');
                }

                const uploadInfoList = [];
                for (const file of files) {
                    const { fileName, contentType } = file;
                    if (!fileName || !contentType) {
                        console.warn('Missing fileName or contentType in request.');
                        continue;
                    }

                    const [url] = await storage.bucket(process.env.GCS_BUCKET_NAME).file(fileName).getSignedUrl({
                        action: 'write',
                        expires: Date.now() + 15 * 60 * 1000,
                        contentType: contentType,
                    });

                    const now = Math.floor(Date.now() / 1000);
                    const jti = Math.random().toString(36).substring(2, 15);
                    const secondJWT = jwt.sign({ userId: decodedBackupToken.userId, fileName: fileName, jti: jti, type: 'upload-auth' }, secretKey, {
                        expiresIn: '5m',
                        notBefore: -1*(60 * 5),
                    });

                    uploadInfoList.push({ uploadUrl: url, secondJWT: secondJWT, fileName: fileName });
                }

                res.json(uploadInfoList);
            } catch (verifyError) {
              console.error("Specific verification error:", verifyError.name, verifyError.message);
              throw verifyError; // Re-throw to be caught by outer catch
            }


    } catch (error) {
        const token = req.headers.authorization.split(' ')[1];
        console.log("SECRET: "+secretKey.length);
        console.log("TOKEN: "+token);
        console.error('Error generating bulk signed URLs:', error);
        res.status(401).send(`Unauthorized or Invalid Token: ${error.name} - ${error.message}`);

    }
});


const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});