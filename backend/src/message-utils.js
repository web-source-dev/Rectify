const prisma = require('./db');

function serialize(message) {
  const media = message.media;
  return {
    id: message.id,
    userId: message.userId,
    name: message.user ? message.user.name : null,
    text: message.text,
    media: media
      ? {
          id: media.id,
          mimeType: media.mimeType,
          width: media.width,
          height: media.height,
          url: `/api/media/${media.id}/file`,
        }
      : null,
    createdAt: message.createdAt.toISOString(),
  };
}

// Validates a client payload and persists it. A message needs text, an
// attached media item (previously uploaded via POST /api/media/upload), or both.
// Returns { message } on success or { error } with an API error code.
async function createMessage(userId, payload) {
  const text = payload && typeof payload.text === 'string' ? payload.text.trim() : '';
  const mediaId = payload && typeof payload.mediaId === 'string' ? payload.mediaId : null;

  if (text.length > 2000 || (!text && !mediaId)) {
    return { error: 'text_invalid_length' };
  }
  if (mediaId) {
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) {
      return { error: 'media_not_found' };
    }
  }

  const message = await prisma.message.create({
    data: { userId, text, mediaId },
    include: { user: true, media: true },
  });
  return { message: serialize(message) };
}

module.exports = { serialize, createMessage };
