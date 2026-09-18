declare module 'fastify' {
  export interface FastifyInstance {
    prisma: any;
    register: (...args: any[]) => any;
    get: (...args: any[]) => any;
    setErrorHandler: (...args: any[]) => any;
    listen: (...args: any[]) => Promise<any>;
    inject: (...args: any[]) => Promise<any>;
    close: (...args: any[]) => Promise<any>;
    log: any;
  }
  const Fastify: any;
  export default Fastify;
}
