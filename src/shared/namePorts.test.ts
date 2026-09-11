import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractPortsFromName } from './namePorts';

describe('extractPortsFromName', () => {
  it('fills both ports from a single number', () => {
    assert.deepEqual(extractPortsFromName('mysql-3306'), { localPort: 3306, remotePort: 3306 });
    assert.deepEqual(extractPortsFromName('3306-mysql'), { localPort: 3306, remotePort: 3306 });
  });

  it('uses the first two numbers for local and remote ports', () => {
    assert.deepEqual(extractPortsFromName('a-1234-b-5678'), { localPort: 1234, remotePort: 5678 });
  });

  it('ignores numbers outside the valid port range', () => {
    assert.equal(extractPortsFromName('no-ports-here'), undefined);
    assert.equal(extractPortsFromName('zero-0-too-big-99999'), undefined);
    assert.deepEqual(extractPortsFromName('bad-99999-good-8080'), { localPort: 8080, remotePort: 8080 });
  });

  it('handles zero values and empty name', () => {
    assert.equal(extractPortsFromName(''), undefined);
    assert.equal(extractPortsFromName('port-0'), undefined);
    assert.deepEqual(extractPortsFromName('port-0-6379'), { localPort: 6379, remotePort: 6379 });
  });
});
