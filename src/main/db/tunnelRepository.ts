import type { TunnelRule } from '../../shared/types';
import type { CreateTunnelInput, UpdateTunnelInput } from '../../shared/schemas';
import { getDatabase } from './database';
import { createId, nowIso } from '../utils/id';

interface TunnelRow {
  id: string;
  server_id: string;
  name: string;
  local_host: string;
  local_port: number;
  remote_host: string;
  remote_port: number;
  auto_start: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapTunnel(row: TunnelRow): TunnelRule {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    localHost: row.local_host,
    localPort: row.local_port,
    remoteHost: row.remote_host,
    remotePort: row.remote_port,
    autoStart: Boolean(row.auto_start),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const ORDER = 'ORDER BY sort_order ASC, created_at ASC';

export class TunnelRepository {
  list(): TunnelRule[] {
    return getDatabase()
      .prepare(`SELECT * FROM tunnels ${ORDER}`)
      .all()
      .map((row) => mapTunnel(row as TunnelRow));
  }

  listByServer(serverId: string): TunnelRule[] {
    return getDatabase()
      .prepare(`SELECT * FROM tunnels WHERE server_id = ? ${ORDER}`)
      .all(serverId)
      .map((row) => mapTunnel(row as TunnelRow));
  }

  listAutoStart(): TunnelRule[] {
    return getDatabase()
      .prepare(`SELECT * FROM tunnels WHERE auto_start = 1 ${ORDER}`)
      .all()
      .map((row) => mapTunnel(row as TunnelRow));
  }

  get(id: string): TunnelRule | undefined {
    const row = getDatabase().prepare('SELECT * FROM tunnels WHERE id = ?').get(id) as TunnelRow | undefined;
    return row ? mapTunnel(row) : undefined;
  }

  private nextSortOrder(): number {
    const row = getDatabase().prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tunnels').get() as { max_order: number };
    return row.max_order + 1;
  }

  create(input: CreateTunnelInput): TunnelRule {
    const createdAt = nowIso();
    const id = createId();
    getDatabase()
      .prepare(
        `INSERT INTO tunnels (
          id, server_id, name, local_host, local_port, remote_host, remote_port, auto_start, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.serverId, input.name, input.localHost, input.localPort, input.remoteHost, input.remotePort, input.autoStart ? 1 : 0, this.nextSortOrder(), createdAt, createdAt);
    return this.get(id) as TunnelRule;
  }

  update(input: UpdateTunnelInput): TunnelRule {
    const updatedAt = nowIso();
    getDatabase()
      .prepare(
        `UPDATE tunnels SET
          server_id = ?, name = ?, local_host = ?, local_port = ?, remote_host = ?, remote_port = ?, auto_start = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(input.serverId, input.name, input.localHost, input.localPort, input.remoteHost, input.remotePort, input.autoStart ? 1 : 0, updatedAt, input.id);
    const tunnel = this.get(input.id);
    if (!tunnel) throw new Error('映射规则不存在');
    return tunnel;
  }

  /** 拖动排序：orderedIds 必须是该服务器下全部映射 id 的一个排列。 */
  reorder(serverId: string, orderedIds: string[]): void {
    const currentIds = this.listByServer(serverId).map((tunnel) => tunnel.id);
    if (currentIds.length !== orderedIds.length) throw new Error('排序不完整，请刷新后重试');
    const currentSet = new Set(currentIds);
    for (const id of orderedIds) {
      if (!currentSet.has(id)) throw new Error('排序包含未知映射，请刷新后重试');
    }

    const db = getDatabase();
    const updateStatement = db.prepare('UPDATE tunnels SET sort_order = ? WHERE id = ?');
    const transaction = db.transaction(() => {
      orderedIds.forEach((id, index) => updateStatement.run(index, id));
    });
    transaction();
  }

  delete(id: string): void {
    getDatabase().prepare('DELETE FROM tunnels WHERE id = ?').run(id);
  }
}
