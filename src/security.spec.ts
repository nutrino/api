import express, { Request } from 'express';
import request from 'supertest';
import { LogLevel } from './common/enums';
import * as Config from './config';
import { BookmarksRouter } from './routers/bookmarks.router';
import * as Server from './server';

describe('HTTP security boundaries', () => {
  let config: Config.IConfigSettings;
  let app: express.Express;
  let service: any;

  const configure = () => {
    app = express();
    Server.initApplication(app);
    service = {
      createBookmarks_v2: jest.fn().mockResolvedValue({ id: 'created' }),
      updateBookmarks_v2: jest.fn().mockResolvedValue({ lastUpdated: new Date() }),
    };
    app.locals.bookmarksRouter = new BookmarksRouter(app, service);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    app.use(Server.handleError);
  };

  beforeEach(() => {
    config = Config.get(true);
    config.log.file.enabled = false;
    config.log.stdout.enabled = false;
    config.throttle.maxRequests = 0;
    configure();
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([null, 123, true, [], { $ne: null }, { toString: 'value' }])(
    'rejects non-string bookmarks without invoking a write: %j',
    async (bookmarks) => {
      const response = await request(app).put('/bookmarks/344eeefd3c834e669be2f10c45bc596e').send({ bookmarks });
      expect(response.status).toBe(400);
      expect(service.updateBookmarks_v2).not.toHaveBeenCalled();
    }
  );

  it.each([{}, [], true, 42, 'x'.repeat(65), '1.5.0\n'])('rejects invalid versions: %j', async (version) => {
    const response = await request(app).post('/bookmarks').send({ version });
    expect(response.status).toBe(400);
    expect(service.createBookmarks_v2).not.toHaveBeenCalled();
  });

  it.each([{}, [], 42, '', 'not-a-date', '2026-02-31T00:00:00.000Z'])(
    'rejects invalid timestamps: %j',
    async (lastUpdated) => {
      const response = await request(app)
        .put('/bookmarks/344eeefd3c834e669be2f10c45bc596e')
        .send({ bookmarks: 'encrypted', lastUpdated });
      expect(response.status).toBe(400);
      expect(service.updateBookmarks_v2).not.toHaveBeenCalled();
    }
  );

  it('accepts existing encrypted payloads and ISO timestamps', async () => {
    const response = await request(app)
      .put('/bookmarks/344eeefd3c834e669be2f10c45bc596e')
      .send({ bookmarks: 'encrypted', version: '1.5.0', lastUpdated: '2026-01-01T00:00:00.000Z' });
    expect(response.status).toBe(200);
    expect(service.updateBookmarks_v2).toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON without disclosing its body', async () => {
    const response = await request(app).post('/bookmarks').type('json').send('{"SECRET":');
    expect(response.status).toBe(400);
    expect(response.text).not.toContain('SECRET');
  });

  it('enforces throttling before parsing malformed bodies', async () => {
    config.throttle.maxRequests = 1;
    configure();
    await request(app).post('/bookmarks').type('json').send('{');
    const response = await request(app).post('/bookmarks').type('json').send('{');
    expect(response.status).toBe(429);
  });

  it('enforces the configured body size limit', async () => {
    config.maxSyncSize = 64;
    configure();
    const response = await request(app)
      .post('/bookmarks')
      .send({ version: '1'.repeat(100) });
    expect(response.status).toBe(413);
  });

  it('uses the first untrusted forwarded address, ignoring a forged prefix', async () => {
    config.server.behindProxy = true;
    configure();
    const response = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.9, 203.0.113.8');
    expect(response.body.ip).toBe('203.0.113.8');
  });

  it('ignores forwarded addresses from an untrusted peer', async () => {
    config.server.behindProxy = true;
    config.server.trustedProxies = ['192.0.2.9'];
    configure();
    const response = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.9');
    expect(response.body.ip).toMatch(/127\.0\.0\.1/);
  });

  it('excludes bearer IDs, headers, bodies and error values from actual Bunyan output', () => {
    const entries: any[] = [];
    Server.createLogger([{ type: 'raw', stream: { write: (entry) => entries.push(entry) } } as any]);
    const req = {
      method: 'PUT',
      url: '/bookmarks/SECRET-ID',
      headers: { authorization: 'SECRET-TOKEN', cookie: 'SECRET-COOKIE' },
      body: { bookmarks: 'SECRET-PAYLOAD' },
    } as any as Request;
    Server.logMessage(LogLevel.Error, 'Request failed', req, new Error('SECRET-ERROR'));
    expect(entries).toHaveLength(1);
    expect(entries[0].req).toEqual({ method: 'PUT' });
    expect(JSON.stringify(entries)).not.toContain('SECRET');
  });
});
