const fs = require('fs')
const express = require('express')

const app = express()

app.get('/', (req, res) => {
  res.send(fs.readFileSync('./marketdata/marketdata.json').toString())
})

app.listen(8000, () => {
  console.log('Listening on port 8000')
})
