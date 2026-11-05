import type { RequestHandler } from 'express';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 8, fieldSize: 10 * 1024, parts: 13 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new Error('Upload JPEG, PNG or WebP images only.'));
      return;
    }
    callback(null, true);
  },
}).array('images', 5);

export const parseProductUpload: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (error) {
      console.warn('Product image upload rejected', error);
      res.locals.productUploadError = error instanceof multer.MulterError
        ? 'Upload no more than 5 images, no larger than 5 MiB each.'
        : 'Upload valid JPEG, PNG or WebP images only.';
    }
    next();
  });
};
