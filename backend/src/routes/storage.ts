import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { uploadFile } from '../services/storage';

export async function storageRoutes(app: FastifyInstance) {
  app.post('/upload', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const buffer = await data.toBuffer();
    const folder = `users/${req.auth!.userId}`;
    const url = await uploadFile(folder, data.filename, buffer, data.mimetype);

    return { url };
  });
}
