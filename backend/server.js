import http from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import dns from "dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);



const port = Number(process.env.PORT || 3000)
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const databaseName = process.env.MONGODB_DB || 'daymark'
const secret = process.env.JWT_SECRET || 'change-this-daymark-development-secret'
const client = new MongoClient(mongoUri)
let db

function hash(password, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
function validPassword(password, stored) { const [salt, expected] = stored.split(':'); const actual = hash(password, salt).split(':')[1]; return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex')) }
function tokenFor(user) { const payload = Buffer.from(JSON.stringify({ id: user._id.toString(), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url'); return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}` }
async function userFor(req) {
  const value = req.headers.authorization || ''; const [payload, signature] = value.replace(/^Bearer\s+/i, '').split('.')
  if (!payload || !signature || createHmac('sha256', secret).update(payload).digest('base64url') !== signature) return null
  try { const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()); return decoded.exp > Date.now() && ObjectId.isValid(decoded.id) ? db.collection('users').findOne({ _id: new ObjectId(decoded.id) }) : null } catch { return null }
}
function publicUser(user) { return { id: user._id.toString(), name: user.name, email: user.email, initials: user.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() } }
function publicEntry(entry) { const { _id, userId, ...rest } = entry; return { id: _id.toString(), ...rest } }
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.CLIENT_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
async function body(req) { let raw = ''; for await (const part of req) raw += part; try { return raw ? JSON.parse(raw) : {} } catch { throw Error('Invalid JSON body') } }
function cleanEntry(input, current = {}) { const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean))].slice(0, 12) : (current.tags || []); return { title: String(input.title ?? current.title ?? '').trim().slice(0, 160), text: String(input.text ?? current.text ?? '').trim(), mood: String(input.mood ?? current.mood ?? '').trim().slice(0, 30), tags, date: input.date || current.date || new Date().toISOString().slice(0, 10) } }

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, `http://${req.headers.host}`); const path = url.pathname
  try {
    const users = db.collection('users'), entries = db.collection('entries')
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { status: 'ok', timestamp: new Date().toISOString() })
    if (req.method === 'POST' && path === '/api/auth/register') {
      const input = await body(req); const name = String(input.name || '').trim(); const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '')
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return send(res, 400, { message: 'Please provide a name, valid email, and a password of at least 6 characters.' })
      if (await users.findOne({ email })) return send(res, 409, { message: 'An account already exists for this email.' })
      const user = { name: name.slice(0, 80), email, password: hash(password), createdAt: new Date().toISOString() }; user._id = (await users.insertOne(user)).insertedId
      return send(res, 201, { token: tokenFor(user), user: publicUser(user) })
    }
    if (req.method === 'POST' && path === '/api/auth/login') { const input = await body(req); const user = await users.findOne({ email: String(input.email || '').trim().toLowerCase() }); if (!user || !validPassword(String(input.password || ''), user.password)) return send(res, 401, { message: 'Incorrect email or password.' }); return send(res, 200, { token: tokenFor(user), user: publicUser(user) }) }
    const user = await userFor(req); if (!user) return send(res, 401, { message: 'Please sign in to continue.' })
    if (req.method === 'POST' && path === '/api/auth/logout') return send(res, 204)
    if (req.method === 'GET' && path === '/api/auth/me') return send(res, 200, { user: publicUser(user) })
    if (path === '/api/profile') { if (req.method === 'GET') return send(res, 200, { user: publicUser(user) }); if (req.method === 'PUT') { const name = String((await body(req)).name || '').trim(); if (!name) return send(res, 400, { message: 'Name is required.' }); await users.updateOne({ _id: user._id }, { $set: { name: name.slice(0, 80) } }); user.name = name.slice(0, 80); return send(res, 200, { user: publicUser(user) }) } }
    if (path === '/api/entries' && req.method === 'GET') { const search = String(url.searchParams.get('search') || '').trim(); const query = { userId: user._id, ...(search && { $text: { $search: search } }) }; const results = await entries.find(query).sort({ date: -1, updatedAt: -1 }).toArray(); return send(res, 200, { entries: results.map(publicEntry) }) }
    if (path === '/api/entries' && req.method === 'POST') { const now = new Date().toISOString(); const entry = { userId: user._id, ...cleanEntry(await body(req)), createdAt: now, updatedAt: now }; entry._id = (await entries.insertOne(entry)).insertedId; return send(res, 201, { entry: publicEntry(entry) }) }
    const match = path.match(/^\/api\/entries\/([^/]+)$/); if (match) { if (!ObjectId.isValid(match[1])) return send(res, 404, { message: 'Entry not found.' }); const filter = { _id: new ObjectId(match[1]), userId: user._id }; const existing = await entries.findOne(filter); if (!existing) return send(res, 404, { message: 'Entry not found.' }); if (req.method === 'GET') return send(res, 200, { entry: publicEntry(existing) }); if (req.method === 'PUT') { const updated = { ...cleanEntry(await body(req), existing), updatedAt: new Date().toISOString() }; await entries.updateOne(filter, { $set: updated }); return send(res, 200, { entry: publicEntry({ ...existing, ...updated }) }) } if (req.method === 'DELETE') { await entries.deleteOne(filter); return send(res, 204) } }
    send(res, 404, { message: 'Route not found.' })
  } catch (error) { console.error(error); send(res, 500, { message: error.message || 'Server error.' }) }
})

async function start() { await client.connect(); db = client.db(databaseName); await Promise.all([db.collection('users').createIndex({ email: 1 }, { unique: true }), db.collection('entries').createIndex({ userId: 1, date: -1 }), db.collection('entries').createIndex({ title: 'text', text: 'text', tags: 'text' })]); server.listen(port, () => console.log(`Daymark API listening on http://localhost:${port} (${databaseName})`)) }
start().catch(error => { console.error('Unable to connect to MongoDB:', error.message); process.exit(1) })
