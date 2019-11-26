const events = require('events')
const fs = require('fs')

function createParser(file, bufferSize) {
  const buf = Buffer.alloc(bufferSize)
  const eventEmitter = new events.EventEmitter()
  let fd
  let position = 0
  let end = 0

  return {
    update() {
      if (!fd) {
        try {
          fd = fs.openSync(file, 'r')
        } catch (e) {
          return 0
        }
      }
      const bytesRead = fs.readSync(fd, buf, position, buf.length - position, null)
      for (let i = position; i < position + bytesRead; i += 1) {
        if (buf[i] === 10) {
          const obj = buf.slice(end, i)
          end = i + 1
          eventEmitter.emit('object', JSON.parse(obj))
        }
      }
      position += bytesRead

      if (buf.length - position < bufferSize / 2) {
        buf.copy(buf, 0, end, position)
        position -= end
        end = 0
      }
      return bytesRead
    },
    close() {
      fs.closeSync(fd)
    },
    eventEmitter
  }
}

module.exports = createParser
