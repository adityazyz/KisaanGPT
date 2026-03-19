import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(
  error: FastifyError,
  _req: FastifyRequest,
  reply: FastifyReply
) {
  const status = error.statusCode ?? 500;
  const message = status < 500 ? error.message : 'Internal Server Error';

  if (status >= 500) {
    console.error('[Error]', error);
  }

  reply.code(status).send({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500
      ? { stack: error.stack }
      : {}),
  });
}
