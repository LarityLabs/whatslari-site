import crypto from 'node:crypto';

export const stableStringify = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
  : item);

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const hashPublicContent = value => sha256(stableStringify(value));

export function hashDecisionEvent(event) {
  const { eventHashSha256: _ignored, ...body } = event;
  return sha256(stableStringify(body));
}
