import { Buffer } from 'node:buffer'
import util from 'node:util'

import { createHexHash } from '@pnpm/crypto.hash'
import { PnpmError, redactAndSanitize, redactUrlForDisplay } from '@pnpm/error'

/**
 * Bytes a registry key carries verbatim. Everything else is percent-escaped,
 * so a `+`, `_` or `%` in the result is always one this module wrote, and the
 * key can never contain a path separator, a character Windows rejects in a
 * filename, or a glob metacharacter — the cache commands interpolate the key
 * straight into a glob pattern, and `pnpm cache delete` erases whatever that
 * pattern matches.
 */
const VERBATIM_BYTES = new Set<number>(
  Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-', (char) => char.charCodeAt(0))
)

/**
 * The 255-byte limit on one filename that ext4, APFS and NTFS share. A
 * registry path long enough to exceed it would make every mirror read miss and
 * every mirror write fail, so such a key collapses to its own hash: still one
 * directory per registry, just no longer readable.
 */
const MAX_KEY_LENGTH = 255

/**
 * Directory name under the metadata cache root that holds a registry's
 * mirrored packuments, shaped `<host>[+<port>][_<path>][_<hash>]`.
 *
 * `+` joins the port to the host and the path segments to one another, `_`
 * separates the host from the path, and every other occurrence of those
 * characters is escaped — so no two registry URLs share a directory. They must
 * not: a shared directory lets the resolver answer from another registry's
 * versions, integrity hashes and tarball URLs, which surfaces as
 * `ERR_PNPM_TARBALL_URL_MISMATCH` when the lockfile is verified.
 *
 * The port is dropped when it is the scheme's default and leading and trailing
 * slashes are trimmed, so the same registry spelled `https://r/`,
 * `https://r:443` and `https://r:443/` keeps one cache rather than three. A
 * path that is not all lowercase gets a sha256 suffix, the guard
 * `encodePkgName` applies to package names, because HFS+ and NTFS would
 * otherwise merge `…/Team` into `…/team`. A key that would not fit a
 * 255-byte filename is replaced by its own hash.
 *
 * `registry` must be a URL with a host; a resolver always has both, so
 * anything else is malformed config and throws
 * `ERR_PNPM_INVALID_REGISTRY_URL` or `ERR_PNPM_MISSING_REGISTRY_HOST`.
 */
export function encodeRegistry (registry: string): string {
  let url: URL
  try {
    url = new URL(registry)
  } catch (err: unknown) {
    const reason = util.types.isNativeError(err) ? err.message : String(err)
    throw new PnpmError('INVALID_REGISTRY_URL', `Failed to parse registry URL "${redactAndSanitize(registry)}": ${redactAndSanitize(reason)}`, { cause: err })
  }
  if (url.hostname === '') {
    throw new PnpmError('MISSING_REGISTRY_HOST', `Registry URL "${redactUrlForDisplay(registry)}" has no host`)
  }
  const host = url.port === '' ? escapeComponent(url.hostname) : `${escapeComponent(url.hostname)}+${url.port}`
  const pathname = trimSlashes(url.pathname)
  if (pathname === '') return host
  const pathKey = `${host}_${pathname.split('/').map(escapeComponent).join('+')}`
  const key = pathname === pathname.toLowerCase() ? pathKey : `${pathKey}_${createHexHash(pathname)}`
  return key.length <= MAX_KEY_LENGTH ? key : createHexHash(key)
}

/**
 * The registry a key made by {@link encodeRegistry} came from, minus its
 * scheme: `host[:port][/path]`. The sha256 that separates two paths differing
 * only in case is not part of the registry, so it is dropped.
 *
 * `pnpm cache view` labels its output with this, and the cache root may also
 * hold directories written by another pnpm version, so an unrecognized name is
 * returned unchanged instead of throwing.
 */
export function decodeRegistry (registryKey: string): string {
  const [host, pathname] = registryKey.split('_')
  try {
    const decodedHost = decodeURIComponent(host.replaceAll('+', ':'))
    return pathname == null ? decodedHost : `${decodedHost}/${decodeURIComponent(pathname.replaceAll('+', '/'))}`
  } catch {
    return registryKey
  }
}

function escapeComponent (component: string): string {
  let escaped = ''
  for (const byte of Buffer.from(component, 'utf8')) {
    escaped += VERBATIM_BYTES.has(byte)
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return escaped
}

function trimSlashes (pathname: string): string {
  let start = 0
  let end = pathname.length
  while (start < end && pathname[start] === '/') start++
  while (end > start && pathname[end - 1] === '/') end--
  return pathname.slice(start, end)
}
