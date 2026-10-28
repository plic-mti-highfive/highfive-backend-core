import type { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CanvasClientService } from './canvas-client.service.js';
import type { CanvasAssistantChatInput } from './canvas.types.js';

/** Serveur HTTP local jetable : aucun service canvas reel, aucun reseau externe. */
describe('CanvasClientService (serveur HTTP local)', () => {
  let server: Server;
  let url: string;
  const received: { path?: string; secret?: string; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        received.push({
          path: request.url,
          secret: request.headers['x-internal-secret'] as string | undefined,
          body,
        });
        if (request.url?.includes('refuse')) {
          response.statusCode = 403;
          response.end();
          return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            canvasId: 'abc',
            elements: [],
            chat: [],
            drawingCount: 0,
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(() => {
    server.close();
  });

  const service = (baseUrl: string) =>
    new CanvasClientService({
      get: (key: string) => (key === 'canvas.url' ? baseUrl : 'secret-interne'),
    } as unknown as ConfigService);

  const message: CanvasAssistantChatInput = {
    id: 'm1',
    authorId: 'ia',
    body: 'Salut',
    sentAt: new Date().toISOString(),
    deleted: false,
    isAssistant: true,
  };

  it("recupere l'export du Mur en envoyant le secret interne", async () => {
    const result = await service(url).fetchExport('abc/def');
    expect(result).toMatchObject({ canvasId: 'abc', drawingCount: 0 });
    const call = received.at(-1)!;
    expect(call.path).toBe('/canvas/abc%2Fdef/export');
    expect(call.secret).toBe('secret-interne');
  });

  it("renvoie null quand le canvas refuse l'export", async () => {
    expect(await service(url).fetchExport('refuse')).toBeNull();
  });

  it('renvoie null quand le canvas est injoignable', async () => {
    expect(await service('http://127.0.0.1:1').fetchExport('abc')).toBeNull();
  });

  it('poste le message de l assistant et renvoie true', async () => {
    expect(await service(url).postChatMessage('abc', message)).toBe(true);
    const call = received.at(-1)!;
    expect(call.path).toBe('/canvas/abc/chat');
    expect(JSON.parse(call.body)).toMatchObject({
      id: 'm1',
      isAssistant: true,
    });
  });

  it("renvoie false quand l'injection est refusee ou le canvas injoignable", async () => {
    expect(await service(url).postChatMessage('refuse', message)).toBe(false);
    expect(
      await service('http://127.0.0.1:1').postChatMessage('abc', message),
    ).toBe(false);
  });
});
