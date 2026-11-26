// An exact HTTPS origin behind an authenticated proxy; the listener stays on loopback.
export function serverOrigins(port, external = '') {
  const local = `http://127.0.0.1:${port}`;
  const origins = new Set([local, `http://localhost:${port}`]);
  if (external) {
    const u = new URL(external);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('invalid_proxy_origin');
    origins.add(u.origin);
  }
  const hosts = new Set([...origins].map(o => new URL(o).host));
  return {local, external: external ? new URL(external).origin : null,
    acceptsHost: host => hosts.has(host), acceptsOrigin: origin => !origin || origins.has(origin)};
}
