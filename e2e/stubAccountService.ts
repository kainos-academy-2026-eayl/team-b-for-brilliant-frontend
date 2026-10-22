import express from 'express'

const app = express()
app.use(express.json())

const users: Record<string, { customerId: string; mfaEnabled: boolean }> = {
  'jane@example.com': { customerId: 'c1', mfaEnabled: false },
  'mfa@example.com': { customerId: 'c2', mfaEnabled: true },
  'mfa-down@example.com': { customerId: 'c3', mfaEnabled: true },
}

app.post('/auth/verify', (req, res) => {
  const { email, password } = req.body
  const user = users[email]
  if (!user) {
    res.sendStatus(404)
    return
  }
  if (password !== 'correct') {
    res.sendStatus(401)
    return
  }
  res.json(user)
})

app.post('/auth/mfa/verify', (req, res) => {
  const { customerId, code } = req.body
  if (customerId === 'c3') {
    res.sendStatus(503)
    return
  }
  res.sendStatus(code === '123456' ? 200 : 401)
})

app.listen(4100)
