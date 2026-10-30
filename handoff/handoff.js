/* Pixeldate moved to one site. This is the whole GitHub Pages site now (index.html, app/index.html and 404.html for
   every other old path; tools/build-handoff.mjs inlines this file into each). On this device's first visit it packs
   what the old site kept here (every pd.* / pd-* localStorage key and the IndexedDB photo) into the URL fragment and
   sends you to the same path and query on the new site, which imports it once (src/movein.ts). Fragments are never
   sent to any server. After that first hand-off (flag pd.moved) it just redirects. */
(function () {
  var TARGET = '__TARGET__', MAXPHOTO = 240000
  var path = location.pathname, search = location.search
  var go = function (p, hash) { location.replace(TARGET + p + search + (hash || '')) }
  var ls; try { ls = window.localStorage } catch (e) { return go(path, location.hash) }
  if (ls.getItem('pd.moved')) return go(path, location.hash)
  var data = {}, n = 0
  for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (/^pd[-.]/.test(k) && k !== 'pd.moved') { data[k] = ls.getItem(k); n++ } }
  var done = false
  var send = function (photo) {
    if (done) return; done = true
    try { ls.setItem('pd.moved', String(Date.now())) } catch (e) {}
    if (!n && !photo) return go(path, location.hash)
    var p = { v: 1, ls: data }; if (photo) p.photo = photo
    var b = new TextEncoder().encode(JSON.stringify(p)), s = ''
    for (var j = 0; j < b.length; j += 0x8000) s += String.fromCharCode.apply(null, b.subarray(j, j + 0x8000))
    var b64 = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    // the importer lives in the app, so a hand-off with data opens the app (same query)
    go('/Pixeldate/app/', '#pdmove=' + b64)
  }
  var shrink = function (url) {
    if (url.length <= MAXPHOTO) return send(url)
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas'), x = c.getContext('2d'), sizes = [1280, 960, 720, 512], qs = [0.85, 0.7, 0.5]
      for (var a = 0; a < sizes.length; a++) {
        var r = Math.min(1, sizes[a] / Math.max(img.naturalWidth, img.naturalHeight))
        c.width = Math.max(1, Math.round(img.naturalWidth * r)); c.height = Math.max(1, Math.round(img.naturalHeight * r))
        x.drawImage(img, 0, 0, c.width, c.height)
        for (var q = 0; q < qs.length; q++) { var o = c.toDataURL('image/jpeg', qs[q]); if (o.length <= MAXPHOTO) return send(o) }
      }
      send(null)
    }
    img.onerror = function () { send(null) }
    img.src = url
  }
  setTimeout(function () { send(null) }, 4000) // never strand anyone on this page
  try {
    var r = indexedDB.open('pixeldate', 1)
    r.onupgradeneeded = function () { r.transaction.abort() } // no photo database here: don't create one
    r.onerror = function () { send(null) }
    r.onsuccess = function () {
      var db = r.result
      try { var g = db.transaction('kv', 'readonly').objectStore('kv').get('photo')
        g.onsuccess = function () { db.close(); typeof g.result === 'string' && /^data:image\//.test(g.result) ? shrink(g.result) : send(null) }
        g.onerror = function () { db.close(); send(null) }
      } catch (e) { db.close(); send(null) }
    }
  } catch (e) { send(null) }
})()
