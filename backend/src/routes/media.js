const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { imageSize } = require('image-size');
const config = require('../config');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const tmpDir = path.join(config.uploadDir, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.tmp`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/3gpp': '.3gp',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
};

function isMediaMime(mime) {
  return mime.startsWith('image/') || mime.startsWith('video/');
}

function fileUrl(id) {
  return `/api/media/${id}/file`;
}

function serialize(media) {
  return {
    id: media.id,
    userId: media.userId,
    name: media.user ? media.user.name : null,
    filename: media.filename,
    mimeType: media.mimeType,
    size: media.size,
    width: media.width,
    height: media.height,
    createdAt: media.createdAt.toISOString(),
    url: fileUrl(media.id),
  };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

router.post('/media/check', requireAuth, async (req, res) => {
  const { checksums } = req.body || {};
  if (!Array.isArray(checksums) || checksums.length === 0) {
    return res.status(400).json({ error: 'checksums_required' });
  }
  if (checksums.length > 500) {
    return res.status(400).json({ error: 'too_many_checksums' });
  }

  const existingRows = await prisma.media.findMany({
    where: { checksum: { in: checksums } },
    select: { checksum: true },
  });

  res.json({ existing: existingRows.map((r) => r.checksum) });
});

router.post('/media/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'file_too_large' });
      }
      return res.status(400).json({ error: 'upload_failed' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file_required' });
    }

    try {
      if (!isMediaMime(file.mimetype)) {
        await fsp.unlink(file.path).catch(() => {});
        return res.status(415).json({ error: 'unsupported_media_type' });
      }

      const checksum = await hashFile(file.path);

      const existing = await prisma.media.findUnique({
        where: { checksum },
        include: { user: true },
      });
      if (existing) {
        await fsp.unlink(file.path).catch(() => {});
        return res.json({ id: existing.id, url: fileUrl(existing.id), duplicate: true });
      }

      const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || '';
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const destDir = path.join(config.uploadDir, yyyy, mm);
      await fsp.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, `${checksum}${ext}`);

      await fsp.rename(file.path, destPath);

      let width = null;
      let height = null;
      if (file.mimetype.startsWith('image/')) {
        try {
          const buffer = await fsp.readFile(destPath);
          const dims = imageSize(buffer);
          width = dims.width || null;
          height = dims.height || null;
        } catch {
          // Non-fatal: some formats (e.g. HEIC) aren't parseable by image-size.
        }
      }

      const media = await prisma.media.create({
        data: {
          userId: req.userId,
          filename: file.originalname || `${checksum}${ext}`,
          mimeType: file.mimetype,
          size: file.size,
          checksum,
          width,
          height,
        },
        include: { user: true },
      });

      res.json({ id: media.id, url: fileUrl(media.id), duplicate: false });
    } catch (e) {
      await fsp.unlink(file.path).catch(() => {});
      // eslint-disable-next-line no-console
      console.error('media upload failed', e);
      res.status(500).json({ error: 'upload_failed' });
    }
  });
});

router.get('/media', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const type = req.query.type || 'all';

  const where = {};
  if (type === 'image') where.mimeType = { startsWith: 'image/' };
  else if (type === 'video') where.mimeType = { startsWith: 'video/' };

  let cursorClause = {};
  if (req.query.cursor) {
    cursorClause = { cursor: { id: req.query.cursor }, skip: 1 };
  }

  const rows = await prisma.media.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...cursorClause,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  res.json({ items: page.map(serialize), nextCursor });
});

router.get('/media/stats', requireAuth, async (req, res) => {
  const [totalCount, totalSizeAgg, images, videos] = await Promise.all([
    prisma.media.count(),
    prisma.media.aggregate({ _sum: { size: true } }),
    prisma.media.count({ where: { mimeType: { startsWith: 'image/' } } }),
    prisma.media.count({ where: { mimeType: { startsWith: 'video/' } } }),
  ]);

  res.json({
    totalCount,
    totalSize: totalSizeAgg._sum.size || 0,
    images,
    videos,
  });
});

router.get('/media/:id/file', requireAuth, async (req, res) => {
  const media = await prisma.media.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ error: 'not_found' });

  const ext = EXT_BY_MIME[media.mimeType] || '';
  const now = media.createdAt;
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const filePath = path.join(config.uploadDir, yyyy, mm, `${media.checksum}${ext}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'file_missing' });
  }

  res.setHeader('Content-Type', media.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

router.delete('/media/:id', requireAuth, async (req, res) => {
  const media = await prisma.media.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ error: 'not_found' });

  const ext = EXT_BY_MIME[media.mimeType] || '';
  const now = media.createdAt;
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const filePath = path.join(config.uploadDir, yyyy, mm, `${media.checksum}${ext}`);

  await prisma.media.delete({ where: { id: media.id } });
  await fsp.unlink(filePath).catch(() => {});

  res.status(204).end();
});

module.exports = router;
