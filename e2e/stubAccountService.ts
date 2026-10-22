import express from 'express'

const app = express()
app.use(express.json())

app.post('/auth/verify', (req, res) => {
  const { email, password } = req.body
  if (email === 'jane@example.com' && password === 'correct') {
    res.json({ customerId: 'c1' })
    return
  }
  res.sendStatus(401)
})

app.listen(4100)
