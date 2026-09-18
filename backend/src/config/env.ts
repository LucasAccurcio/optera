import 'dotenv/config';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
} as const;
