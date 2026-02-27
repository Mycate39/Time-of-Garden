import mineflayer from 'mineflayer'

const BOT_HOST = 'timeofgarden818.mcsh.io'
const BOT_PORT = 25565
const BOT_USERNAME = 'GardenBot'
const RECONNECT_DELAY = 30000

let bot = null
let reconnectTimer = null
let currentStatus = 'stopped'
let onStatusChange = null

function setStatus(status, detail = '') {
  currentStatus = status
  onStatusChange?.({ status, detail })
}

function cleanup() {
  if (bot) {
    try { bot.quit() } catch {}
    bot = null
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (currentStatus !== 'stopped') connect()
  }, RECONNECT_DELAY)
}

// ---- VarInt/String helpers pour le handshake FML3 ----
function readVarInt(buf, offset) {
  let value = 0, shift = 0, byte
  do {
    byte = buf.readUInt8(offset++)
    value |= (byte & 0x7F) << shift
    shift += 7
  } while (byte & 0x80)
  return [value, offset]
}

function writeVarInt(value) {
  const bytes = []
  value = value >>> 0
  do {
    let b = value & 0x7F
    value >>>= 7
    if (value !== 0) b |= 0x80
    bytes.push(b)
  } while (value !== 0)
  return Buffer.from(bytes)
}

function readString(buf, offset) {
  const [len, off] = readVarInt(buf, offset)
  return [buf.toString('utf8', off, off + len), off + len]
}

function writeString(str) {
  const buf = Buffer.from(str, 'utf8')
  return Buffer.concat([writeVarInt(buf.length), buf])
}

/**
 * Construit la réponse C2S FML3 pour un paquet S2C reçu sur fml:handshake.
 *
 * Forge 47.x (1.20.1) utilise IndexedMessageCodec : le premier octet est le
 * discriminateur du type de message. Les messages C2S ont toujours le
 * discriminateur du S2C correspondant + 1.
 *
 * S2CModList     (disc 0) → C2SModListReply (disc 1) : mods + channels mirrored
 * S2CChannelData (disc 2) → C2SChannelData  (disc 3) : channels mirrored
 * S2CAck         (disc 4) → C2SAck          (disc 5) : vide
 * Autres                  → disc+1 + liste vide
 */
function buildFML3Response(data) {
  try {
    if (!data || data.length === 0) return Buffer.from([1, 0, 0])
    const disc = data.readUInt8(0)
    const payload = data.slice(1) // données après le discriminateur

    if (disc === 5) {
      // S2CModList (disc 5 dans Forge 47.4.1) → C2SModListReply (disc 6)
      // Format S2C : VarInt modCount, [(modId, modVersion)...],
      //              VarInt chanCount, [(chanId, version, required)...]
      let offset = 0
      const mods = []
      const channels = []

      try {
        const [modCount, off1] = readVarInt(payload, 0); offset = off1
        for (let i = 0; i < modCount; i++) {
          const [id, off2] = readString(payload, offset); offset = off2
          const [ver, off3] = readString(payload, offset); offset = off3
          mods.push({ id, ver })
        }
        const [chanCount, off4] = readVarInt(payload, offset); offset = off4
        for (let i = 0; i < chanCount; i++) {
          const [id, off5] = readString(payload, offset); offset = off5
          const [ver, off6] = readString(payload, offset); offset = off6
          const req = payload.readUInt8(offset++) === 1
          channels.push({ id, ver, req })
        }
      } catch { /* parsing partiel OK, on envoie ce qu'on a */ }

      // C2SModListReply (disc 1) :
      // on renvoie les mods + channels identiques au serveur
      const parts = [
        Buffer.from([6]),          // discriminateur C2SModListReply
        writeVarInt(mods.length)
      ]
      for (const m of mods) {
        parts.push(writeString(m.id))
        parts.push(writeString(m.ver))
      }
      parts.push(writeVarInt(channels.length))
      for (const ch of channels) {
        parts.push(writeString(ch.id))
        parts.push(writeString(ch.ver))
        parts.push(Buffer.from([ch.req ? 1 : 0]))
      }
      return Buffer.concat(parts)
    }

    if (disc === 7) {
      // S2CChannelData → C2SChannelData (disc 8)
      // Format similaire à S2CModList mais juste des channels
      let offset = 0
      const channels = []
      try {
        const [count, off1] = readVarInt(payload, 0); offset = off1
        for (let i = 0; i < count; i++) {
          const [id, off2] = readString(payload, offset); offset = off2
          const [ver, off3] = readString(payload, offset); offset = off3
          channels.push({ id, ver })
        }
      } catch {}

      const parts = [Buffer.from([8]), writeVarInt(channels.length)]
      for (const ch of channels) {
        parts.push(writeString(ch.id))
        parts.push(writeString(ch.ver))
      }
      return Buffer.concat(parts)
    }

    // Acquiescement générique (S2CAck, etc.) → disc+1 + vide
    return Buffer.from([disc + 1, 0])
  } catch {
    return Buffer.from([1, 0, 0])
  }
}

function connect() {
  if (bot) return
  setStatus('connecting')

  try {
    bot = mineflayer.createBot({
      host: BOT_HOST,
      port: BOT_PORT,
      username: BOT_USERNAME,
      auth: 'offline',
      version: '1.20.1',
      hideErrors: false
    })

    /**
     * HACK FML3 : la connexion TCP est asynchrone, donc le paquet handshake
     * n'est PAS encore envoyé quand createBot() retourne. On peut intercepter
     * l'écriture du paquet set_protocol pour injecter le marqueur \0FML3\0
     * dans le champ serverHost — ce qui indique au serveur Forge qu'on est un
     * client FML3 et déclenche l'échange login_plugin_request/response au lieu
     * d'un rejet vanilla immédiat.
     */
    const origWrite = bot._client.write.bind(bot._client)
    bot._client.write = function (name, data) {
      if (name === 'set_protocol' && data?.serverHost) {
        data = { ...data, serverHost: data.serverHost + '\0FML3\0' }
      }
      return origWrite(name, data)
    }

    /**
     * Intercepter login_plugin_request au niveau de emit() plutôt qu'en
     * utilisant removeAllListeners(), car mineflayer peut enregistrer ses
     * propres handlers de manière asynchrone (ex. sur l'événement 'connect')
     * APRÈS notre appel à removeAllListeners. En patchant emit(), on empêche
     * TOUS les handlers (présents et futurs) de recevoir l'événement.
     */
    const origEmit = bot._client.emit.bind(bot._client)
    bot._client.emit = function (event, ...args) {
      if (event === 'login_plugin_request') {
        const packet = args[0]
        console.log(`[FML3] ← id=${packet.messageId} ch=${packet.channel}`)

        if (packet.channel === 'fml:loginwrapper' && packet.data) {
          // Dépaqueter l'enveloppe loginwrapper :
          // String(innerChannel) + VarInt(innerLen) + innerData
          const [innerChannel, off1] = readString(packet.data, 0)
          const [innerLen, off2] = readVarInt(packet.data, off1)
          const innerData = packet.data.slice(off2, off2 + innerLen)

          console.log(`[FML3]   inner=${innerChannel} disc=${innerData[0]}`)

          if (innerChannel === 'fml:handshake') {
            const innerResp = buildFML3Response(innerData)
            // Ré-envelopper dans loginwrapper
            const wrapped = Buffer.concat([
              writeString(innerChannel),
              writeVarInt(innerResp.length),
              innerResp
            ])
            console.log(`[FML3] → id=${packet.messageId} respDisc=${innerResp[0]}`)
            bot._client.write('login_plugin_response', { messageId: packet.messageId, data: wrapped })
          } else {
            bot._client.write('login_plugin_response', { messageId: packet.messageId })
          }
        } else {
          bot._client.write('login_plugin_response', { messageId: packet.messageId })
        }
        return true
      }
      return origEmit(event, ...args)
    }

    bot.once('spawn', () => {
      setStatus('online')
    })

    bot.on('error', (err) => {
      if (currentStatus === 'stopped') return
      setStatus('reconnecting', err.message)
      cleanup()
      scheduleReconnect()
    })

    bot.on('end', (reason) => {
      if (currentStatus === 'stopped') return
      setStatus('reconnecting', reason ?? '')
      cleanup()
      scheduleReconnect()
    })

    bot.on('kicked', (reason) => {
      if (currentStatus === 'stopped') return
      const msg = typeof reason === 'string' ? reason : JSON.stringify(reason)
      setStatus('reconnecting', msg)
      cleanup()
      scheduleReconnect()
    })
  } catch (err) {
    setStatus('reconnecting', err.message)
    scheduleReconnect()
  }
}

export function startBot(onStatus) {
  onStatusChange = onStatus
  if (currentStatus !== 'stopped') {
    onStatus?.({ status: currentStatus })
    return
  }
  connect()
}

export function stopBot() {
  currentStatus = 'stopped'
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  cleanup()
  onStatusChange?.({ status: 'stopped' })
}

export function getBotStatus() {
  return currentStatus
}
