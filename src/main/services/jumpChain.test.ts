import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ServerConfig } from '../../shared/types';
import { describeJumpPath, resolveJumpChain } from './jumpChain';

function makeServer(id: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id,
    groupId: 'g1',
    name: `server-${id}`,
    host: '127.0.0.1',
    port: 22,
    username: 'user',
    authType: 'password',
    autoReconnect: true,
    reconnectInterval: 3000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('resolveJumpChain', () => {
  it('returns only the target when no jump is configured', () => {
    const target = makeServer('t');
    const chain = resolveJumpChain(() => undefined, target);
    assert.deepEqual(chain.map((server) => server.id), ['t']);
    assert.equal(describeJumpPath(chain), undefined);
  });

  it('resolves a single jump host', () => {
    const jump = makeServer('j');
    const target = makeServer('t', { jumpServerId: 'j' });
    const getServer = (id: string) => (id === 'j' ? jump : undefined);
    const chain = resolveJumpChain(getServer, target);
    assert.deepEqual(chain.map((server) => server.id), ['t', 'j']);
    assert.equal(describeJumpPath(chain), 'server-j');
  });

  it('resolves multi-hop chains outermost last', () => {
    const k = makeServer('k');
    const j = makeServer('j', { jumpServerId: 'k' });
    const target = makeServer('t', { jumpServerId: 'j' });
    const getServer = (id: string) => ({ j, k }[id] as ServerConfig);
    const chain = resolveJumpChain(getServer, target);
    assert.deepEqual(chain.map((server) => server.id), ['t', 'j', 'k']);
    assert.equal(describeJumpPath(chain), 'server-k → server-j');
  });

  it('rejects a direct self-reference', () => {
    const target = makeServer('t', { jumpServerId: 't' });
    const getServer = (id: string) => (id === 't' ? target : undefined);
    assert.throws(() => resolveJumpChain(getServer, target), /循环/);
  });

  it('rejects a two-server cycle', () => {
    const a = makeServer('a', { jumpServerId: 'b' });
    const b = makeServer('b', { jumpServerId: 'a' });
    const getServer = (id: string) => (id === 'a' ? a : b);
    assert.throws(() => resolveJumpChain(getServer, a), /循环/);
  });

  it('rejects a missing jump host', () => {
    const target = makeServer('t', { jumpServerId: 'ghost' });
    assert.throws(() => resolveJumpChain(() => undefined, target), /不存在/);
  });

  it('rejects chains longer than the maximum depth', () => {
    const chain: ServerConfig[] = [];
    for (let index = 0; index < 10; index++) {
      chain.push(makeServer(`s${index}`, { jumpServerId: index === 9 ? undefined : `s${index + 1}` }));
    }
    const getServer = (id: string) => chain.find((server) => server.id === id);
    assert.throws(() => resolveJumpChain(getServer, chain[0]), /链路过长/);
  });
});
