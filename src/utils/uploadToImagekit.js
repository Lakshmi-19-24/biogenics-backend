import { toFile } from '@imagekit/nodejs';
import { ApiError } from './apiError.js';
import { imagekit } from '../config/imagekit.js';

/**
 * Uploads an in-memory Multer file to ImageKit.
 *
 * @param {Express.Multer.File} file
 * @param {string} folder
 * @returns {Promise<{ url: string, fileId: string, name: string, size: number, mimeType: string }>}
 */
export const uploadToImageKit = async (file, folder = '/biogenics') => {
  if (!file) throw new ApiError(400, 'File is required');

  let uploaded;
  try {
    uploaded = await imagekit.files.upload({
      file: await toFile(file.buffer, file.originalname),
      fileName: `${Date.now()}-${file.originalname}`,
      folder,
      useUniqueFileName: true
    });
  } catch (error) {
    throw new ApiError(error?.response?.status || 502, error?.message || 'ImageKit upload failed');
  }

  return {
    url: uploaded.url,
    fileId: uploaded.fileId,
    name: uploaded.name,
    size: file.size,
    mimeType: file.mimetype
  };
};