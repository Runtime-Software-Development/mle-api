#!/usr/bin/env node

/**
 * Bulk upsert users into Keycloak via Admin API.
 *
 * Usage examples:
 *   node bulk-sync-users.mjs --file ./users.sample.json --dry-run
 *   node bulk-sync-users.mjs --file ./users.sample.json --apply
 *
 * Required env vars:
 *   KEYCLOAK_BASE_URL
 *   KEYCLOAK_REALM
 *   KEYCLOAK_CLIENT_ID
 *   KEYCLOAK_CLIENT_SECRET
 */

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg = (name) => {
  const idx = argv.findIndex((x) => x === name);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
};

const fileArg = getArg('--file') || process.env.KEYCLOAK_USERS_FILE;
const isApply = hasFlag('--apply') || String(process.env.KEYCLOAK_APPLY || '').toLowerCase() === 'true';
const isDryRun = hasFlag('--dry-run') || !isApply;

const config = {
  baseUrl: (process.env.KEYCLOAK_BASE_URL || '').replace(/\/$/, ''),
  realm: process.env.KEYCLOAK_REALM || '',
  clientId: process.env.KEYCLOAK_CLIENT_ID || '',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
};

function fail(msg, code = 1) {
  console.error(`[ERROR] ${msg}`);
  process.exit(code);
}

if (!fileArg) fail('Missing --file argument (or KEYCLOAK_USERS_FILE env).');
if (!config.baseUrl) fail('Missing KEYCLOAK_BASE_URL env.');
if (!config.realm) fail('Missing KEYCLOAK_REALM env.');
if (!config.clientId) fail('Missing KEYCLOAK_CLIENT_ID env.');
if (!config.clientSecret) fail('Missing KEYCLOAK_CLIENT_SECRET env.');

const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) fail(`Input file does not exist: ${filePath}`);

function parseBool(v, defaultValue = false) {
  if (v === undefined || v === null || v === '') return defaultValue;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseDelimitedList(value, separator = ';') {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(separator)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = i + 1 < line.length ? line[i + 1] : '';

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }

  cells.push(cur);
  return cells.map((x) => x.trim());
}

function loadUsers(fileName) {
  const raw = fs.readFileSync(fileName, 'utf8');
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.users)) {
      return parsed.users;
    }
    throw new Error('JSON input must be either an array of users or an object containing a users array.');
  }

  if (ext === '.csv') {
    const lines = raw
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0 && !x.startsWith('#'));

    if (!lines.length) return [];

    const headers = parseCsvLine(lines[0]);
    const out = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] ?? '';
      });

      out.push({
        username: obj.username,
        email: obj.email,
        firstName: obj.firstName,
        lastName: obj.lastName,
        enabled: parseBool(obj.enabled, true),
        emailVerified: parseBool(obj.emailVerified, false),
        password: obj.password || undefined,
        passwordTemporary: parseBool(obj.passwordTemporary, true),
        realmRoles: parseDelimitedList(obj.realmRoles),
        attributes: obj.attributes ? JSON.parse(obj.attributes) : {},
        clientRoles: obj.clientRoles ? JSON.parse(obj.clientRoles) : {},
      });
    }

    return out;
  }

  throw new Error(`Unsupported file type '${ext}'. Use .json or .csv.`);
}

async function kcFetch(token, pathname, options = {}) {
  const method = options.method || 'GET';
  const url = `${config.baseUrl}${pathname}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${pathname} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function getAccessToken() {
  const tokenUrl = `${config.baseUrl}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Token response does not include access_token.');
  }
  return payload.access_token;
}

async function findUserByUsername(token, username) {
  const list = await kcFetch(
    token,
    `/admin/realms/${encodeURIComponent(config.realm)}/users?username=${encodeURIComponent(username)}&exact=true`
  );
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function getUserById(token, userId) {
  return kcFetch(token, `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}`);
}

async function createUser(token, user) {
  await kcFetch(token, `/admin/realms/${encodeURIComponent(config.realm)}/users`, {
    method: 'POST',
    body: {
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled,
      emailVerified: user.emailVerified,
      attributes: user.attributes || {},
    },
  });

  const created = await findUserByUsername(token, user.username);
  if (!created?.id) throw new Error(`Created user '${user.username}' but failed to resolve user ID.`);
  return created;
}

async function updateUser(token, userId, user) {
  const current = await getUserById(token, userId);

  await kcFetch(token, `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: {
      ...current,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled,
      emailVerified: user.emailVerified,
      attributes: user.attributes || {},
    },
  });
}

async function setPassword(token, userId, password, temporary = true) {
  if (!password) return;
  await kcFetch(token, `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'PUT',
    body: {
      type: 'password',
      value: password,
      temporary,
    },
  });
}

async function getRealmRole(token, roleName) {
  return kcFetch(token, `/admin/realms/${encodeURIComponent(config.realm)}/roles/${encodeURIComponent(roleName)}`);
}

async function assignRealmRoles(token, userId, roleNames) {
  if (!roleNames.length) return;
  const roleRepresentations = [];
  for (const roleName of roleNames) {
    const role = await getRealmRole(token, roleName);
    roleRepresentations.push({ id: role.id, name: role.name });
  }

  await kcFetch(
    token,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    { method: 'POST', body: roleRepresentations }
  );
}

async function getClientByClientId(token, clientId) {
  const clients = await kcFetch(
    token,
    `/admin/realms/${encodeURIComponent(config.realm)}/clients?clientId=${encodeURIComponent(clientId)}`
  );
  if (!Array.isArray(clients) || !clients.length) {
    throw new Error(`Client '${clientId}' not found.`);
  }
  return clients[0];
}

async function getClientRole(token, internalClientId, roleName) {
  return kcFetch(
    token,
    `/admin/realms/${encodeURIComponent(config.realm)}/clients/${encodeURIComponent(internalClientId)}/roles/${encodeURIComponent(roleName)}`
  );
}

async function assignClientRoles(token, userId, clientRolesMap) {
  const clientEntries = Object.entries(clientRolesMap || {});
  for (const [clientId, roles] of clientEntries) {
    const roleNames = parseDelimitedList(roles);
    if (!roleNames.length) continue;

    const client = await getClientByClientId(token, clientId);
    const roleRepresentations = [];

    for (const roleName of roleNames) {
      const role = await getClientRole(token, client.id, roleName);
      roleRepresentations.push({ id: role.id, name: role.name, containerId: client.id });
    }

    await kcFetch(
      token,
      `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(client.id)}`,
      {
        method: 'POST',
        body: roleRepresentations,
      }
    );
  }
}

function normalizeUser(raw) {
  if (!raw || !raw.username) {
    throw new Error('Each user must include a non-empty username.');
  }

  return {
    username: String(raw.username).trim(),
    email: raw.email ? String(raw.email).trim() : undefined,
    firstName: raw.firstName ? String(raw.firstName) : undefined,
    lastName: raw.lastName ? String(raw.lastName) : undefined,
    enabled: parseBool(raw.enabled, true),
    emailVerified: parseBool(raw.emailVerified, false),
    password: raw.password ? String(raw.password) : undefined,
    passwordTemporary: parseBool(raw.passwordTemporary, true),
    attributes: raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : {},
    realmRoles: parseDelimitedList(raw.realmRoles),
    clientRoles: raw.clientRoles && typeof raw.clientRoles === 'object' ? raw.clientRoles : {},
  };
}

async function main() {
  const loaded = loadUsers(filePath);
  const users = loaded.map(normalizeUser);

  if (!users.length) {
    console.log('[INFO] No users in input file. Nothing to do.');
    return;
  }

  const summary = {
    total: users.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    mode: isDryRun ? 'dry-run' : 'apply',
  };

  console.log(`[INFO] Loaded ${users.length} users from ${filePath}`);
  console.log(`[INFO] Mode: ${summary.mode}`);

  const token = await getAccessToken();

  for (const user of users) {
    try {
      const existing = await findUserByUsername(token, user.username);
      const action = existing ? 'update' : 'create';

      if (isDryRun) {
        console.log(`[DRY-RUN] Would ${action} user '${user.username}'`);
        if (user.realmRoles.length) {
          console.log(`[DRY-RUN]   realmRoles: ${user.realmRoles.join(', ')}`);
        }
        if (Object.keys(user.clientRoles).length) {
          console.log(`[DRY-RUN]   clientRoles: ${JSON.stringify(user.clientRoles)}`);
        }
        summary.skipped += 1;
        continue;
      }

      let resolvedUser = existing;
      if (!resolvedUser) {
        resolvedUser = await createUser(token, user);
        summary.created += 1;
        console.log(`[APPLY] Created user '${user.username}'`);
      } else {
        await updateUser(token, resolvedUser.id, user);
        summary.updated += 1;
        console.log(`[APPLY] Updated user '${user.username}'`);
      }

      await setPassword(token, resolvedUser.id, user.password, user.passwordTemporary);
      await assignRealmRoles(token, resolvedUser.id, user.realmRoles);
      await assignClientRoles(token, resolvedUser.id, user.clientRoles);
    } catch (error) {
      summary.failed += 1;
      console.error(`[ERROR] Failed user '${user.username}': ${error.message}`);
    }
  }

  console.log('');
  console.log('[SUMMARY]');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  fail(error.message || String(error), 2);
});
