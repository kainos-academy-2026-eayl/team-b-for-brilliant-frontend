import type { RequestHandler } from 'express';
import multer from 'multer';

export const parseProductUpload: RequestHandler = (req, res, next) => {
  if (!req.productCategories) {
    next(new Error('Product categories must be loaded before parsing uploads'));
    return;
  }
  const fields = 8 + req.productCategories.length;
  const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields, fieldSize: 10 * 1024, parts: fields + 5 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new Error('Upload JPEG, PNG or WebP images only.'));
      return;
    }
    callback(null, true);
  },
  }).array('images', 5);
  upload(req, res, (error: unknown) => {
    if (error) {
      console.warn('Product image upload rejected', error);
      if (error instanceof multer.MulterError && (
        error.field === 'categoryIDs' || error.code === 'LIMIT_FIELD_COUNT' || error.code === 'LIMIT_PART_COUNT'
      )) {
        res.locals.productCategoryError = 'Select categories from the available list and try again.';
        next();
        return;
      }
      res.locals.productUploadError = error instanceof multer.MulterError
        ? 'Upload no more than 5 images, no larger than 5 MiB each.'
        : 'Upload valid JPEG, PNG or WebP images only.';
    }
    next();
  });
};
