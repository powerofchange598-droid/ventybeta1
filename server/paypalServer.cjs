const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:3000';
const DEFAULT_CURRENCY = (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase();
const ALLOWED_CURRENCIES = (process.env.ALLOWED_CURRENCIES || 'USD,EUR,GBP,AUD,CAD').split(',').map(s => s.trim().toUpperCase());
const BASE_URL = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const HAS_CREDENTIALS = !!(PAYPAL_CLIENT_ID && PAYPAL_SECRET);
if (!HAS_CREDENTIALS) {
  console.warn('Warning: PAYPAL_CLIENT_ID or PAYPAL_SECRET not set. Set environment variables before starting the server.');
}

if (PAYPAL_ENV === 'live' && !CLIENT_BASE_URL.startsWith('https://')) {
  console.warn('Warning: CLIENT_BASE_URL is not HTTPS while PAYPAL_ENV=live. PayPal requires HTTPS return/cancel URLs.');
}

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  CLIENT_BASE_URL
]);
app.use(cors({
  origin: Array.from(allowedOrigins),
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

function storeTransaction(record) {
  try {
    const file = path.join(__dirname, 'data', 'transactions.json');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing = [];
    if (fs.existsSync(file)) {
      existing = JSON.parse(fs.readFileSync(file, 'utf-8') || '[]');
    }
    existing.unshift({ savedAt: new Date().toISOString(), ...record });
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error('Failed to store transaction:', err);
  }
}

function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf-8') || '';
      return text ? JSON.parse(text) : fallback;
    }
  } catch {}
  return fallback;
}

function saveJson(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save json', file, err);
  }
}

// --- Promo Codes Storage ---
const PROMO_CODES_FILE = path.join(__dirname, 'data', 'promo-codes.json');
const PROMO_USAGE_FILE = path.join(__dirname, 'data', 'promo-usage.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const WEBVIEW_CLICKS_FILE = path.join(__dirname, 'data', 'webview-clicks.json');
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';

function seedDefaultPromoCodes() {
  const codes = loadJson(PROMO_CODES_FILE, []);
  const hasAlex = codes.some(c => c.code === 'alex456123');
  const hasZxc = codes.some(c => c.code === 'zxcasd456');
  if (!hasAlex) {
    codes.push({ code: 'alex456123', type: 'percent', percent: 100, validityDaysAfterActivation: 45, permanent: false, createdAt: new Date().toISOString() });
  }
  if (!hasZxc) {
    codes.push({ code: 'zxcasd456', type: 'percent', percent: 50, permanent: true, createdAt: new Date().toISOString() });
  }
  saveJson(PROMO_CODES_FILE, codes);
}
seedDefaultPromoCodes();

// Helper: find promo code
function findPromo(code) {
  const codes = loadJson(PROMO_CODES_FILE, []);
  return codes.find(c => c.code.toLowerCase() === String(code).toLowerCase());
}

// Helper: record usage
function recordPromoUsage(code, userId, status, meta) {
  const usage = loadJson(PROMO_USAGE_FILE, []);
  usage.unshift({ code, userId, status, meta, at: new Date().toISOString() });
  saveJson(PROMO_USAGE_FILE, usage);
}

// GET all promo codes
app.get('/api/promo-codes', (_req, res) => {
  const codes = loadJson(PROMO_CODES_FILE, []);
  res.json({ ok: true, codes });
});

// Create promo code
app.post('/api/promo-codes', (req, res) => {
  const { code, type = 'percent', percent = 0, permanent = false, validityDaysAfterActivation } = req.body || {};
  if (!code || (type === 'percent' && (percent <= 0 || percent > 100))) {
    return res.status(400).json({ ok: false, error: 'invalid_code_params' });
  }
  const codes = loadJson(PROMO_CODES_FILE, []);
  if (codes.some(c => c.code.toLowerCase() === String(code).toLowerCase())) {
    return res.status(409).json({ ok: false, error: 'code_exists' });
  }
  const newCode = { code, type, percent, permanent: !!permanent, validityDaysAfterActivation, createdAt: new Date().toISOString() };
  codes.push(newCode);
  saveJson(PROMO_CODES_FILE, codes);
  res.json({ ok: true, code: newCode });
});

// Update promo code
app.put('/api/promo-codes/:code', (req, res) => {
  const codeParam = req.params.code;
  const codes = loadJson(PROMO_CODES_FILE, []);
  const idx = codes.findIndex(c => c.code.toLowerCase() === codeParam.toLowerCase());
  if (idx < 0) return res.status(404).json({ ok: false, error: 'not_found' });
  const curr = codes[idx];
  const updated = { ...curr, ...req.body, code: curr.code };
  codes[idx] = updated;
  saveJson(PROMO_CODES_FILE, codes);
  res.json({ ok: true, code: updated });
});

// Delete promo code
app.delete('/api/promo-codes/:code', (req, res) => {
  const codeParam = req.params.code;
  const codes = loadJson(PROMO_CODES_FILE, []);
  const filtered = codes.filter(c => c.code.toLowerCase() !== codeParam.toLowerCase());
  saveJson(PROMO_CODES_FILE, filtered);
  res.json({ ok: true });
});

// Apply promo code for user
app.post('/api/promo-codes/apply', (req, res) => {
  const { code, userId } = req.body || {};
  if (!code || !userId) return res.status(400).json({ ok: false, error: 'code_and_user_required' });
  const promo = findPromo(code);
  if (!promo) {
    recordPromoUsage(code, userId, 'invalid');
    return res.status(404).json({ ok: false, status: 'invalid' });
  }
  const usage = loadJson(PROMO_USAGE_FILE, []);
  const userRecords = usage.filter(u => u.code.toLowerCase() === String(code).toLowerCase() && u.userId === userId);
  const activation = userRecords.find(u => u.status === 'activated');
  if (promo.permanent) {
    if (!activation) recordPromoUsage(promo.code, userId, 'activated');
    return res.json({ ok: true, status: 'active', discountPercent: promo.percent });
  }
  // time-bounded promo: activate and compute expiry
  const validityDays = Number(promo.validityDaysAfterActivation || 0);
  if (!activation) {
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
    recordPromoUsage(promo.code, userId, 'activated', { expiresAt });
    return res.json({ ok: true, status: 'active', discountPercent: promo.percent, expiresAt });
  } else {
    const expiresAt = activation.meta?.expiresAt;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      recordPromoUsage(promo.code, userId, 'expired');
      return res.status(410).json({ ok: false, status: 'expired' });
    }
    return res.json({ ok: true, status: 'active', discountPercent: promo.percent, expiresAt });
  }
});

// Get active promos for user
app.get('/api/promo-codes/active/:userId', (req, res) => {
  const { userId } = req.params;
  const codes = loadJson(PROMO_CODES_FILE, []);
  const usage = loadJson(PROMO_USAGE_FILE, []);
  const active = [];
  for (const code of codes) {
    const records = usage.filter(u => u.code.toLowerCase() === code.code.toLowerCase() && u.userId === userId);
    const act = records.find(r => r.status === 'activated');
    if (code.permanent) {
      if (act || records.length === 0) active.push({ code: code.code, percent: code.percent, permanent: true });
      continue;
    }
    if (act) {
      const expiresAt = act.meta?.expiresAt;
      if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) {
        active.push({ code: code.code, percent: code.percent, expiresAt });
      }
    }
  }
  const bestPercent = active.reduce((p, c) => Math.max(p, Number(c.percent || 0)), 0);
  res.json({ ok: true, active, bestPercent });
});

app.post('/api/paypal/order', async (req, res) => {
  try {
    const { amount, currency, description = 'Payment' } = req.body || {};
    if (!amount) {
      return res.status(400).json({ ok: false, error: 'amount is required' });
    }
    if (!HAS_CREDENTIALS) {
      return res.status(500).json({ ok: false, error: 'missing_paypal_credentials' });
    }
    const cc = (currency || DEFAULT_CURRENCY).toUpperCase();
    if (!ALLOWED_CURRENCIES.includes(cc)) {
      return res.status(400).json({ ok: false, error: `unsupported_currency:${cc}` });
    }
    const returnUrl = `${CLIENT_BASE_URL.replace(/\/$/, '')}/#/payment?paypalReturn=1`;
    const cancelUrl = `${CLIENT_BASE_URL.replace(/\/$/, '')}/#/payment?paypalCancel=1`;
    if (PAYPAL_ENV === 'live' && (!returnUrl.startsWith('https://') || !cancelUrl.startsWith('https://'))) {
      return res.status(400).json({ ok: false, error: 'invalid_https_urls' });
    }
    const token = await getAccessToken();
    const orderRes = await fetch(`${BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          { amount: { currency_code: cc, value: Number(amount).toFixed(2) }, description }
        ],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('PayPal order error', orderRes.status, orderData);
      storeTransaction({ type: 'order_error', status: orderRes.status, error: orderData });
      return res.status(orderRes.status).json({ ok: false, error: orderData });
    }
    const approveLink = (orderData.links || []).find(l => l.rel === 'approve')?.href;
    return res.json({ ok: true, id: orderData.id, approveLink });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/paypal/order/:orderId/capture', async (req, res) => {
  try {
    const { orderId } = req.params;
    const token = await getAccessToken();
  const captureRes = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  const captureData = await captureRes.json();
  if (!captureRes.ok) {
      console.error('PayPal capture error', captureRes.status, captureData);
      storeTransaction({ type: 'capture_error', orderId, status: captureRes.status, error: captureData });
      return res.status(captureRes.status).json({ ok: false, error: captureData });
  }
    storeTransaction({ type: 'order', orderId, capture: captureData });
    return res.json({ ok: true, data: captureData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/paypal/subscription', async (req, res) => {
  try {
    const { planId, subscriber = {}, returnUrl, cancelUrl } = req.body || {};
    if (!planId || !returnUrl || !cancelUrl) {
      return res.status(400).json({ ok: false, error: 'planId, returnUrl, cancelUrl required' });
    }
    const token = await getAccessToken();
    const subRes = await fetch(`${BASE_URL}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          brand_name: 'Venty',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
        },
        subscriber,
      }),
    });
    const subData = await subRes.json();
    if (!subRes.ok) {
      return res.status(subRes.status).json({ ok: false, error: subData });
    }
    const approveLink = (subData.links || []).find(l => l.rel === 'approve')?.href;
    storeTransaction({ type: 'subscription_init', subscriptionId: subData.id, raw: subData });
    return res.json({ ok: true, id: subData.id, approveLink });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/paypal/webhook', async (req, res) => {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      return res.status(500).json({ ok: false, error: 'webhook_id_missing' });
    }
    const transmissionId = req.headers['paypal-transmission-id'];
    const transmissionSig = req.headers['paypal-transmission-sig'];
    const certUrl = req.headers['paypal-cert-url'];
    const authAlgo = req.headers['paypal-auth-algo'];
    const transmissionTime = req.headers['paypal-transmission-time'];
    if (!transmissionId || !transmissionSig || !certUrl || !authAlgo || !transmissionTime) {
      return res.status(400).json({ ok: false, error: 'missing_webhook_headers' });
    }
    const token = await getAccessToken();
    const verifyRes = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: req.body,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData.verification_status !== 'SUCCESS') {
      return res.status(400).json({ ok: false, error: 'verification_failed', data: verifyData });
    }
    storeTransaction({ type: 'webhook', event: req.body, verification: verifyData });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, env: PAYPAL_ENV, hasCredentials: HAS_CREDENTIALS }));

function setSessionCookie(res, id) {
  const secure = PAYPAL_ENV === 'live' || CLIENT_BASE_URL.startsWith('https://');
  const maxAge = 30 * 24 * 60 * 60;
  const parts = [
    `venty_session=${id}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function parseCookie(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function upsertUserFromIdentity(identity) {
  const users = loadJson(USERS_FILE, []);
  const { provider, providerId, email, name, picture } = identity;
  let user = users.find(u => (u.providers || []).some(p => p.provider === provider && p.providerId === providerId) || (email && u.email && u.email.toLowerCase() === email.toLowerCase()));
  if (!user) {
    user = { userId: `${provider}:${providerId}`, email: email || '', name: name || '', providers: [{ provider, providerId, email, picture }], createdAt: new Date().toISOString(), passwordHash: null, passwordSalt: null };
    users.push(user);
  } else {
    const has = (user.providers || []).some(p => p.provider === provider && p.providerId === providerId);
    if (!has) {
      user.providers = [...(user.providers || []), { provider, providerId, email, picture }];
    }
    if (email && !user.email) user.email = email;
    if (name && !user.name) user.name = name;
    if (picture) {
      user.providers = (user.providers || []).map(p => p.provider === provider && p.providerId === providerId ? { ...p, picture } : p);
    }
  }
  saveJson(USERS_FILE, users);
  return user;
}
function createSession(userId) {
  const sessions = loadJson(SESSIONS_FILE, []);
  const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  sessions.unshift({ id, userId, expiresAt, createdAt: new Date().toISOString() });
  saveJson(SESSIONS_FILE, sessions.slice(0, 1000));
  return id;
}
function getSession(sessionId) {
  const sessions = loadJson(SESSIONS_FILE, []);
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) return null;
  return s;
}
app.get('/api/auth/me', (req, res) => {
  const cookies = parseCookie(req);
  const sid = cookies['venty_session'];
  if (!sid) return res.json({ ok: false });
  const s = getSession(sid);
  if (!s) return res.json({ ok: false });
  const users = loadJson(USERS_FILE, []);
  const user = users.find(u => u.userId === s.userId) || null;
  if (!user) return res.json({ ok: false });
  res.json({ ok: true, user });
});
app.post('/api/auth/logout', (req, res) => {
  const secure = PAYPAL_ENV === 'live' || CLIENT_BASE_URL.startsWith('https://');
  const parts = [
    'venty_session=',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  res.json({ ok: true });
});
app.post('/api/auth/session/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'missing_id_token' });
    const tokeninfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const info = await tokeninfo.json();
    if (!tokeninfo.ok) return res.status(401).json({ ok: false, error: 'invalid_token' });
    if (GOOGLE_CLIENT_ID && info.aud !== GOOGLE_CLIENT_ID) return res.status(401).json({ ok: false, error: 'aud_mismatch' });
    const identity = { provider: 'google', providerId: info.sub, email: info.email, name: info.name };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
app.post('/api/auth/session/facebook', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ ok: false, error: 'missing_access_token' });
    if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
      const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
      const dbg = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`);
      const dbgData = await dbg.json();
      if (!dbg.ok || !dbgData?.data?.is_valid) return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
    const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
    const me = await meRes.json();
    if (!meRes.ok) return res.status(401).json({ ok: false, error: 'profile_error' });
    const identity = { provider: 'facebook', providerId: me.id, email: me.email, name: me.name };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
app.post('/api/auth/session/apple', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'missing_id_token' });
    const mod = await import('jose');
    const JWKS = mod.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const { payload } = await mod.jwtVerify(idToken, JWKS, { issuer: 'https://appleid.apple.com', audience: APPLE_CLIENT_ID || undefined });
    const identity = { provider: 'apple', providerId: payload.sub, email: payload.email, name: '' };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch {
    res.status(401).json({ ok: false, error: 'invalid_token' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'missing_id_token' });
    const tokeninfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const info = await tokeninfo.json();
    if (!tokeninfo.ok) return res.status(401).json({ ok: false, error: 'invalid_token' });
    if (GOOGLE_CLIENT_ID && info.aud !== GOOGLE_CLIENT_ID) return res.status(401).json({ ok: false, error: 'aud_mismatch' });
    const identity = { provider: 'google', providerId: info.sub, email: info.email, name: info.name, picture: info.picture };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
app.post('/api/auth/facebook', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ ok: false, error: 'missing_access_token' });
    if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
      const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
      const dbg = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`);
      const dbgData = await dbg.json();
      if (!dbg.ok || !dbgData?.data?.is_valid) return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
    const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`);
    const me = await meRes.json();
    if (!meRes.ok) return res.status(401).json({ ok: false, error: 'profile_error' });
    const identity = { provider: 'facebook', providerId: me.id, email: me.email, name: me.name, picture: me?.picture?.data?.url };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
app.post('/api/auth/apple', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'missing_id_token' });
    const mod = await import('jose');
    const JWKS = mod.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const { payload } = await mod.jwtVerify(idToken, JWKS, { issuer: 'https://appleid.apple.com', audience: APPLE_CLIENT_ID || undefined });
    const identity = { provider: 'apple', providerId: payload.sub, email: payload.email, name: '' };
    const user = upsertUserFromIdentity(identity);
    const sid = createSession(user.userId);
    setSessionCookie(res, sid);
    res.json({ ok: true, user });
  } catch {
    res.status(401).json({ ok: false, error: 'invalid_token' });
  }
});
function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}
function hashPassword(password, salt) {
  const h = crypto.scryptSync(String(password), String(salt), 64);
  return h.toString('hex');
}
app.post('/api/auth/email/signup', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmailAddress(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!password || String(password).length < 8) return res.status(400).json({ ok: false, error: 'weak_password' });
  const users = loadJson(USERS_FILE, []);
  const existing = users.find(u => u.email && u.email.toLowerCase() === String(email).toLowerCase());
  if (existing) return res.status(409).json({ ok: false, error: 'email_exists' });
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const userId = `user_${Math.random().toString(36).slice(2)}`;
  const user = { userId, email, name: '', providers: [], createdAt: new Date().toISOString(), passwordHash, passwordSalt: salt };
  users.push(user);
  saveJson(USERS_FILE, users);
  const sid = createSession(user.userId);
  setSessionCookie(res, sid);
  res.json({ ok: true, user });
});
app.post('/api/auth/email/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmailAddress(email) || !password) return res.status(400).json({ ok: false, error: 'invalid_credentials' });
  const users = loadJson(USERS_FILE, []);
  const user = users.find(u => u.email && u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !user.passwordHash || !user.passwordSalt) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  const calc = hashPassword(password, user.passwordSalt);
  if (calc !== user.passwordHash) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  const sid = createSession(user.userId);
  setSessionCookie(res, sid);
  res.json({ ok: true, user });
});
// --- Basic user profile storage (country/currency) ---
app.post('/api/users/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const { country, countryCode, currency } = req.body || {};
  if (!userId || !countryCode || !currency) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const users = loadJson(USERS_FILE, []);
  const idx = users.findIndex(u => u.userId === userId);
  const profile = { userId, country, countryCode, currency, updatedAt: new Date().toISOString() };
  if (idx >= 0) users[idx] = { ...users[idx], ...profile };
  else users.push(profile);
  saveJson(USERS_FILE, users);
  res.json({ ok: true, profile });
});

// --- Lightweight click tracker to avoid preview timeouts ---
app.post('/api/webviewClick', (req, res) => {
  try {
    const { path: clickedPath, meta } = req.body || {};
    const clicks = loadJson(WEBVIEW_CLICKS_FILE, []);
    clicks.unshift({
      path: clickedPath || '/',
      meta: meta || {},
      ua: req.headers['user-agent'],
      at: new Date().toISOString(),
    });
    saveJson(WEBVIEW_CLICKS_FILE, clicks.slice(0, 500));
    res.json({ ok: true });
  } catch (err) {
    console.error('webviewClick error', err);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`PayPal backend running on port ${PORT}`);
});
