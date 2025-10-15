const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const asyncLib = require('async');

// Configure Multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../public/uploads');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// Configure image processing queue with sharp
const processedDir = path.join(__dirname, '../processed');
if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
}

const imageProcessingQueue = asyncLib.queue((task, callback) => {
    sharp(task.filePath)
        .rotate()
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toFile(path.join(processedDir, path.basename(task.filePath)))
        .then(() => {
            fs.unlink(task.filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting original file:', unlinkErr);
                callback(null, `/processed/${path.basename(task.filePath)}`);
            });
        })
        .catch((error) => {
            console.error('Image processing error:', error);
            callback(error);
        });
}, 2); // Process 2 images concurrently

module.exports = {
    upload,
    imageProcessingQueue
};