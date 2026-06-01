let webpush

function ensurePushDb(db) {
  db.pushSubscriptions = Array.isArray(db.pushSubscriptions) ? db.pushSubscriptions : []
  db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {}
  return db.pushSubscriptions
}

function getWebPush() {
  if (webpush !== undefined) return webpush
  try {
    webpush = require('web-push')
  } catch {
    webpush = null
  }
  return webpush
}

function ensureVapidKeys(db) {
  ensurePushDb(db)
  const provider = getWebPush()
  if (!provider) return null
  if (!db.settings.push_vapid_public || !db.settings.push_vapid_private) {
    const keys = provider.generateVAPIDKeys()
    db.settings.push_vapid_public = keys.publicKey
    db.settings.push_vapid_private = keys.privateKey
  }
  return {
    publicKey: db.settings.push_vapid_public,
    privateKey: db.settings.push_vapid_private
  }
}

async function sendPushNotification(db, userId, payload) {
  const provider = getWebPush()
  const keys = ensureVapidKeys(db)
  if (!provider || !keys || !userId) return
  provider.setVapidDetails('mailto:admin@infraflow.local', keys.publicKey, keys.privateKey)
  const subscriptions = ensurePushDb(db).filter(item => String(item.user_id) === String(userId))
  await Promise.allSettled(subscriptions.map(async item => {
    try {
      await provider.sendNotification({
        endpoint: item.endpoint,
        keys: { p256dh: item.p256dh, auth: item.auth }
      }, JSON.stringify(payload))
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        db.pushSubscriptions = db.pushSubscriptions.filter(subscription => subscription.endpoint !== item.endpoint)
      }
    }
  }))
}

module.exports = { ensurePushDb, ensureVapidKeys, sendPushNotification }
