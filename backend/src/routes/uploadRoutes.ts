import { RequestHandler, Router } from 'express';
import multer from 'multer';
import { handleFileUpload } from '../controllers/uploadController';

const router = Router();

// Configure multer for file uploads (in-memory storage for now)
// For larger files or production, consider diskStorage or streaming directly to S3/processing service
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit for zip files
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .zip files are allowed.'));
    }
  }
});

router.post('/', upload.single('zipfile'), handleFileUpload as RequestHandler);

export default router;

