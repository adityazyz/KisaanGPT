import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

import { farmerRoutes }       from './routes/farmers';
import { buyerRoutes }        from './routes/buyers';
import { supplierRoutes }     from './routes/suppliers';
import { adminRoutes }        from './routes/admin';
import { cropPlanRoutes }     from './routes/cropPlans';
import { productionRoutes }   from './routes/production';
import { supplyRoutes }       from './routes/supply';
import { matchingRoutes }     from './routes/matching';
import { storageRoutes }      from './routes/storage';
import { webhookRoutes }      from './routes/webhooks';
import { internalRoutes }     from './routes/internal';
import { callRoutes }         from './routes/calls';
import { inboundCallRoutes }  from './routes/inboundCalls';
import { chatRoutes }         from './routes/chat';
import { authMiddleware }     from './middleware/auth';
import { errorHandler }       from './middleware/errorHandler';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

const PORT            = parseInt(process.env.PORT || '4000', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',');

async function bootstrap() {
  await app.register(cors, {
    origin:      ALLOWED_ORIGINS,
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.addHook('preHandler', authMiddleware);
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await app.register(webhookRoutes,     { prefix: '/webhooks'       });
  await app.register(inboundCallRoutes, { prefix: '/api/inbound'    });
  await app.register(internalRoutes);
  await app.register(farmerRoutes,      { prefix: '/api/farmers'    });
  await app.register(buyerRoutes,       { prefix: '/api/buyers'     });
  await app.register(supplierRoutes,    { prefix: '/api/suppliers'  });
  await app.register(adminRoutes,       { prefix: '/api/admin'      });
  await app.register(cropPlanRoutes,    { prefix: '/api/crop-plans' });
  await app.register(productionRoutes,  { prefix: '/api/production' });
  await app.register(supplyRoutes,      { prefix: '/api/supply'     });
  await app.register(matchingRoutes,    { prefix: '/api/matching'   });
  await app.register(storageRoutes,     { prefix: '/api/storage'    });
  await app.register(callRoutes,        { prefix: '/api/calls'      });
  await app.register(chatRoutes,        { prefix: '/api/chat'       });

  app.setErrorHandler(errorHandler);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`AgriConnect API listening on port ${PORT}`);
}

bootstrap().catch(err => { console.error('Fatal startup error:', err); process.exit(1); });