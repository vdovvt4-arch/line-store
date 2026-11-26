const crypto = require('crypto');
const { AppError } = require('../utils/http');
const { request } = require('./supabase');

const BUCKET = 'line-store-media';
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function hasExpectedSignature(contents, mimeType) {
  if (mimeType === 'image/jpeg') {
    return contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return mimeType === 'image/webp'
    && contents.length >= 12
    && contents.toString('ascii', 0, 4) === 'RIFF'
    && contents.toString('ascii', 8, 12) === 'WEBP';
}

function getProjectUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function isProjectMediaUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const project = new URL(getProjectUrl());
    const media = new URL(value);
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    const parts = media.pathname.slice(prefix.length).split('/');
    return media.origin === project.origin
      && media.protocol === 'https:'
      && !media.username
      && !media.password
      && media.pathname.startsWith(prefix)
      && ['products', 'promos'].includes(decodeURIComponent(parts[0] || ''))
      && parts.length === 2
      && !media.search
      && !media.hash;
  } catch {
    return false;
  }
}

function storagePathFromUrl(value) {
  if (!isProjectMediaUrl(value)) throw new AppError(400, 'رابط صورة غير صالح');
  const media = new URL(value);
  const encoded = media.pathname.slice(`/storage/v1/object/public/${BUCKET}/`.length);
  const parts = encoded.split('/').map(part => {
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw new AppError(400, 'رابط صورة غير صالح');
    }
    if (!decoded || decoded === '.' || decoded === '..' || /[\\/]/.test(decoded)) {
      throw new AppError(400, 'رابط صورة غير صالح');
    }
    return decoded;
  });
  if (!['products', 'promos'].includes(parts[0]) || parts.length !== 2) {
    throw new AppError(400, 'رابط صورة غير صالح');
  }
  return parts.join('/');
}

async function uploadMedia(image, folder) {
  if (!['products', 'promos'].includes(folder)) {
    throw new AppError(400, 'مجلد الصور غير صالح');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(image || ''));
  if (!match) throw new AppError(400, 'صيغة الصورة غير مدعومة');
  const mimeType = match[1];
  const contents = Buffer.from(match[2], 'base64');
  if (!contents.length || contents.length > MAX_FILE_BYTES) {
    throw new AppError(413, 'حجم الصورة يتجاوز الحد المسموح (4 ميغابايت)');
  }
  if (!hasExpectedSignature(contents, mimeType)) {
    throw new AppError(400, 'محتوى الملف لا يطابق صيغة الصورة المعلنة');
  }

  const objectPath = `${folder}/${crypto.randomUUID()}.${MIME_EXTENSIONS[mimeType]}`;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  await request(`/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: 'POST',
    body: contents,
    headers: {
      'Content-Type': mimeType,
      'x-upsert': 'false',
    },
  });
  const projectUrl = new URL(getProjectUrl());
  return {
    path: objectPath,
    url: `${projectUrl.origin}/storage/v1/object/public/${BUCKET}/${encodedPath}`,
  };
}

async function deleteMediaUrls(urls) {
  if (!Array.isArray(urls) || urls.length > 50) {
    throw new AppError(400, 'عدد روابط الصور غير صالح');
  }
  const paths = [...new Set(urls.map(storagePathFromUrl))];
  if (!paths.length) return 0;
  await request(`/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    body: { prefixes: paths },
  });
  return paths.length;
}

module.exports = { uploadMedia, deleteMediaUrls, isProjectMediaUrl, MAX_FILE_BYTES };
