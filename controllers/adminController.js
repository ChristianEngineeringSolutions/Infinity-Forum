
// Helper function to get a formatted date/time string for folder names
function getFormattedDateTime() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
}

// Create a folder in Google Cloud Storage
async function createGcsFolder(folderPath, bucketName) {
  try {
    // In GCS, folders are simulated by creating a 0-byte object with a trailing slash
    const folderObject = storage.bucket(bucketName).file(`${folderPath}/`);
    
    // Check if folder already exists
    const [exists] = await folderObject.exists();
    if (!exists) {
      // Create the folder by writing an empty file with folder metadata
      await folderObject.save('', {
        metadata: {
          contentType: 'application/x-directory'
        }
      });
      console.log(`Created GCS folder: ${folderPath}/`);
    } else {
      console.log(`GCS folder already exists: ${folderPath}/`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error creating GCS folder ${folderPath}:`, error);
    throw error;
  }
}

// Helper function to determine content type based on file extension
async function getContentType(filePath) {
  const fsp = require('fs').promises;
  try {
    const ext = path.extname(filePath).toLowerCase();

    // MIME types based on file extensions
    const extToMime = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      // Add more extensions as needed
    };

    if (extToMime[ext]) {
      return extToMime[ext];
    }

    // Magic number detection (for more accurate MIME type)
    try {
      const buffer = await fsp.readFile(filePath);
      const mime = magic(buffer);  // You'll need to ensure 'magic' is properly defined/imported

      if (mime) {
        return mime;
      }
    } catch (magicError) {
      console.error('Error with magic number detection:', magicError);
    }

    return 'application/octet-stream'; // Default if MIME type cannot be determined
  } catch (error) {
    console.error('Error determining content type:', error);
    return 'application/octet-stream'; // Default on error
  }
}

// Helper function to upload a file with retry logic
async function uploadFileWithRetry(filePath, gcsFilePath, bucketName) {
  const { default: pRetry } = await import('p-retry');
  
  const operation = async () => {
    try {
      const contentType = await getContentType(filePath);
      const fileContent = await fsp.readFile(filePath);
      
      // Upload directly to GCS using the Storage client
      await storage.bucket(bucketName).file(gcsFilePath).save(fileContent, {
        contentType: contentType,
        metadata: {
          contentType: contentType
        }
      });
      
      console.log(`Uploaded to GCS path ${gcsFilePath} successfully.`);
      return true;
    } catch (error) {
      console.error(`Error during upload attempt for ${gcsFilePath}:`, error);
      throw error; // Throw to trigger retry
    }
  };
  
  return pRetry(operation, { 
    retries: 3, 
    onFailedAttempt: error => console.log(`Attempt ${error.attemptNumber} failed for ${gcsFilePath}. Retrying...`) 
  });
}

// Function to recursively process a directory and its subdirectories
async function processDirectory(localDirPath, gcsFolderBase, bucketName, basePath = '') {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(5); // Concurrency limit
  
  try {
    // Read the contents of the directory
    const entries = await fsp.readdir(path.join(localDirPath, basePath), { withFileTypes: true });
    const uploadPromises = [];
    
    // Process each entry (file or directory)
    for (const entry of entries) {
      const entryRelativePath = path.join(basePath, entry.name);
      const entryFullPath = path.join(localDirPath, entryRelativePath);
      
      if (entry.isDirectory()) {
        // Create the corresponding GCS subfolder
        const gcsSubfolderPath = `${gcsFolderBase}/${entryRelativePath}`;
        await createGcsFolder(gcsSubfolderPath, bucketName);
        
        // Recursively process subdirectory
        await processDirectory(localDirPath, gcsFolderBase, bucketName, entryRelativePath);
      } else if (entry.isFile()) {
        // Upload file with limited concurrency
        uploadPromises.push(limit(async () => {
          try {
            // Determine the GCS path for this file
            const gcsFilePath = `${gcsFolderBase}/${entryRelativePath}`;
            await uploadFileWithRetry(entryFullPath, gcsFilePath, bucketName);
          } catch (error) {
            console.error(`Error processing file ${entryRelativePath}:`, error);
          }
        }));
      }
    }
    
    // Wait for all file uploads at this level to complete
    await Promise.all(uploadPromises);
    
  } catch (error) {
    console.error(`Error processing directory ${path.join(localDirPath, basePath)}:`, error);
    throw error;
  }
}

// Main function to upload a directory and all its subdirectories to GCS
async function uploadDirectoryToGCS(directoryPath, bucketName) {
  try {
    // Get directory name from path
    const dirName = path.basename(directoryPath);
    
    // Create GCS folder with directory name and timestamp
    const timestamp = getFormattedDateTime();
    const gcsFolderBase = `${dirName}_${timestamp}`;
    
    // Create the root GCS folder
    await createGcsFolder(gcsFolderBase, bucketName);
    
    console.log(`Starting upload of ${directoryPath} to GCS folder: ${gcsFolderBase}`);
    
    // Process the directory and all its subdirectories
    await processDirectory(directoryPath, gcsFolderBase, bucketName);
    
    console.log(`Finished processing directory: ${directoryPath} to GCS folder: ${gcsFolderBase}`);
    return true;
  } catch (error) {
    console.error('Error uploading files from directory:', error);
    throw error;
  }
}

/**
 * Downloads the most recent backup of a specified folder type from GCS
 * @param {string} bucketName - The name of the GCS bucket
 * @param {string} folderType - One of 'uploads', 'protected', or 'dump'
 * @param {string} localBaseDir - Base local directory (usually __dirname)
 * @param {boolean} deleteExisting - Whether to delete existing files before downloading
 * @returns {Promise<void>}
 */
async function downloadMostRecentBackup(bucketName, folderType, localBaseDir, deleteExisting = false) {
  try {
    // Validate folder type
    if (!['uploads', 'protected', 'dump'].includes(folderType)) {
      throw new Error(`Invalid folder type: ${folderType}. Must be one of 'uploads', 'protected', or 'dump'`);
    }
    
    // Map local directories based on folder type
    const folderPaths = {
      'uploads': path.join(localBaseDir, 'dist/uploads'),
      'protected': path.join(localBaseDir, 'protected'),
      'dump': path.join(localBaseDir, 'dump')
    };
    
    const localDirectory = folderPaths[folderType];
    
    // Initialize the Google Cloud Storage client
    const storage = new Storage();
    
    // Get a reference to the bucket
    const bucket = storage.bucket(bucketName);
    
    // List all folders starting with the folderType
    const [files] = await bucket.getFiles({ prefix: `${folderType}_` });
    
    // Extract unique folder names
    const folderNames = new Set();
    files.forEach(file => {
      const folderName = file.name.split('/')[0];
      if (folderName.startsWith(`${folderType}_`)) {
        folderNames.add(folderName);
      }
    });
    
    // Convert to array and sort chronologically (newest first)
    const sortedFolders = Array.from(folderNames).sort().reverse();
    
    if (sortedFolders.length === 0) {
      console.log(`No backup folders found starting with "${folderType}_"`);
      return;
    }
    
    // Get the most recent folder
    const mostRecentFolder = sortedFolders[0];
    console.log(`Most recent backup folder: ${mostRecentFolder}`);
    
    // Get all files in the most recent folder
    const [folderFiles] = await bucket.getFiles({ prefix: `${mostRecentFolder}/` });
    
    // Delete existing directory if requested
    if (deleteExisting) {
      try {
        console.log(`Deleting existing directory: ${localDirectory}`);
        await fsp.rm(localDirectory, { recursive: true, force: true });
      } catch (err) {
        // If directory doesn't exist, that's fine
        if (err.code !== 'ENOENT') {
          console.warn(`Warning: Could not delete directory: ${err.message}`);
        }
      }
    }
    
    // Make sure the local directory exists
    await fsp.mkdir(localDirectory, { recursive: true });
    
    // Download each file
    console.log(`Downloading ${folderFiles.length} files to ${localDirectory}...`);
    
    // Set to track directories we've already created
    const createdDirs = new Set();
    createdDirs.add(localDirectory);
    
    for (const file of folderFiles) {
      // Skip the folder placeholder object (ends with '/')
      if (file.name.endsWith('/')) continue;
      
      // Get the file path without the folder prefix
      const relativePath = file.name.replace(`${mostRecentFolder}/`, '');
      const localFilePath = path.join(localDirectory, relativePath);
      
      // Create subdirectories if needed
      const dir = path.dirname(localFilePath);
      if (!createdDirs.has(dir)) {
        await fsp.mkdir(dir, { recursive: true });
        createdDirs.add(dir);
      }
      
      // Download the file
      await file.download({ destination: localFilePath });
      console.log(`Downloaded: ${relativePath}`);
    }
    
    console.log(`Download completed successfully for ${folderType}!`);
    
  } catch (error) {
    console.error(`Error downloading ${folderType} from GCS:`, error);
    throw error;
  }
}

/**
 * Download multiple folder types
 * @param {string} bucketName - The name of the GCS bucket
 * @param {Array<string>} folderTypes - Array of folder types to download ('uploads', 'protected', 'dump')
 * @param {string} localBaseDir - Base local directory
 * @param {boolean} deleteExisting - Whether to delete existing files before downloading
 * @returns {Promise<void>}
 */
async function downloadMultipleFolders(bucketName, folderTypes, localBaseDir, deleteExisting = false) {
  for (const folderType of folderTypes) {
    console.log(`\n==== Processing ${folderType} ====`);
    await downloadMostRecentBackup(bucketName, folderType, localBaseDir, deleteExisting);
  }
  console.log('\nAll requested folders have been processed!');
}

module.exports = {
    getFormattedDateTime,
    createGcsFolder,
    getContentType,
    uploadFileWithRetry,
    processDirectory,
    uploadDirectoryToGCS,
    downloadMostRecentBackup,
    downloadMultipleFolders
};