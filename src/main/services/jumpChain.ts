import type { ServerConfig } from '../../shared/types';

export const MAX_JUMP_DEPTH = 8;

/**
 * 解析跳板链（ProxyJump）。
 * 返回 [目标, 一级跳板, ..., 最外层跳板]；无跳板时返回 [目标]。
 * 自引用、循环引用或链路过长时抛错。
 */
export function resolveJumpChain(
  getServer: (id: string) => ServerConfig | undefined,
  target: ServerConfig
): ServerConfig[] {
  const chain: ServerConfig[] = [target];
  const seen = new Set<string>([target.id]);
  let current = target;

  while (current.jumpServerId) {
    const next = getServer(current.jumpServerId);
    if (!next) throw new Error(`跳板机 ${current.jumpServerId} 不存在`);
    if (seen.has(next.id)) throw new Error('跳板机链路存在循环，请检查配置');
    if (chain.length >= MAX_JUMP_DEPTH) throw new Error('跳板机链路过长（最多支持 8 级）');
    seen.add(next.id);
    chain.push(next);
    current = next;
  }

  return chain;
}

/** 跳板路径描述（最外层 → 最内层），用于日志展示；无跳板时返回 undefined。 */
export function describeJumpPath(chain: ServerConfig[]): string | undefined {
  if (chain.length <= 1) return undefined;
  return chain.slice(1).reverse().map((server) => server.name).join(' → ');
}
