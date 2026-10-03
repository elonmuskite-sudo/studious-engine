import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.example.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-api-key'
process.env.RESEND_FROM = 'Nexus <admin@example.test>'
process.env.NODE_ENV = 'production'

const originalFetch = globalThis.fetch
const originalNow = Date.now
const sentEmails = []
const authRequests = []
const codes = ['123456', '654321', '456789', '789012']
let codeIndex = 0

globalThis.fetch = async (request, options = {}) => {
  const url = new URL(request instanceof Request ? request.url : request)
  if (url.hostname === 'api.resend.com') {
    const body = JSON.parse(options.body)
    sentEmails.push(body)
    return new Response(JSON.stringify({ id: `resend-${sentEmails.length}` }), { status: 201 })
  }

  if (url.pathname.endsWith('/auth/v1/admin/generate_link')) {
    const body = JSON.parse(options.body)
    authRequests.push(body)
    const code = codes[codeIndex++]
    return new Response(JSON.stringify({
      action_link: 'https://auth.example.test/action',
      email_otp: code,
      hashed_token: 'not-a-real-token-hash',
      redirect_to: 'https://app.example.test/verify-email',
      verification_type: body.type,
      user: { id: `user-${authRequests.length}`, email: body.email, user_metadata: body.data || {} },
    }), { status: 200 })
  }

  throw new Error(`Unexpected mocked request: ${url.pathname}`)
}

const { default: handler } = await import('../api/auth/email-code.js')

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

function request(body, headers = {}) {
  return {
    method: 'POST',
    headers: { origin: 'https://app.example.test', host: 'app.example.test', ...headers },
    body,
  }
}

before(() => {
  Date.now = () => 1_000_000
})

after(() => {
  globalThis.fetch = originalFetch
  Date.now = originalNow
})

test('signup generates a Supabase signup OTP and sends it through Resend', async () => {
  const res = responseRecorder()
  await handler(request({
    action: 'signup',
    purpose: 'signup',
    email: 'new-user@example.test',
    password: 'Secure-test-password-123',
    firstName: 'New',
    lastName: 'User',
    memberId: '1012345678',
  }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true })
  assert.match(res.headers['Set-Cookie'], /HttpOnly/)
  assert.match(res.headers['Set-Cookie'], /Secure/)
  assert.equal(authRequests.at(-1).type, 'signup')
  assert.equal(authRequests.at(-1).data.member_id, '1012345678')
  assert.equal(sentEmails.at(-1).to[0], 'new-user@example.test')
  assert.match(sentEmails.at(-1).text, /123456/)
  assert.equal(JSON.stringify(res.body).includes('123456'), false)
})

test('resend reuses the pending code and sends it through Resend', async () => {
  const signupResponse = responseRecorder()
  await handler(request({
    action: 'signup',
    purpose: 'signup',
    email: 'resend-user@example.test',
    password: 'Secure-test-password-123',
    firstName: 'Resend',
    lastName: 'User',
    memberId: '1098765432',
  }), signupResponse)

  const cookie = signupResponse.headers['Set-Cookie'].split(';')[0]
  Date.now = () => 1_061_000
  const res = responseRecorder()
  await handler(request({ action: 'resend', purpose: 'signup', email: 'resend-user@example.test' }, { cookie }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true })
  assert.match(sentEmails.at(-1).text, /654321/)
})

test('password recovery generates and sends a recovery OTP through Resend', async () => {
  Date.now = () => 1_122_000
  const res = responseRecorder()
  await handler(request({
    action: 'recovery',
    purpose: 'recovery',
    email: 'recover-user@example.test',
  }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true })
  assert.equal(authRequests.at(-1).type, 'recovery')
  assert.equal(sentEmails.at(-1).to[0], 'recover-user@example.test')
  assert.match(sentEmails.at(-1).text, /456789/)
})

test('clear removes the pending resend cookie after verification', async () => {
  Date.now = () => 1_183_000
  const signupResponse = responseRecorder()
  await handler(request({
    action: 'signup',
    purpose: 'signup',
    email: 'clear-user@example.test',
    password: 'Secure-test-password-123',
    firstName: 'Clear',
    lastName: 'User',
    memberId: '1011121314',
  }), signupResponse)

  const cookie = signupResponse.headers['Set-Cookie'].split(';')[0]
  const res = responseRecorder()
  await handler(request({ action: 'clear', purpose: 'signup', email: 'clear-user@example.test' }, { cookie }), res)

  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/)
})

test('rejects requests from a different origin before calling providers', async () => {
  const authCount = authRequests.length
  const resendCount = sentEmails.length
  const res = responseRecorder()
  await handler(request({ action: 'recovery', purpose: 'recovery', email: 'private@example.test' }, {
    origin: 'https://attacker.example',
  }), res)

  assert.equal(res.statusCode, 403)
  assert.equal(authRequests.length, authCount)
  assert.equal(sentEmails.length, resendCount)
})