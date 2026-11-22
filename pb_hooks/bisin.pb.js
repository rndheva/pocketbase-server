// Naik / turun penumpang (idempoten berdasarkan event_id)
routerAdd("POST", "/api/bisin/events", (e) => {
  const key = $os.getenv("BISIN_API_KEY")
  if (!key || e.request.header.get("X-API-Key") !== key) {
    throw new UnauthorizedError("API key salah atau tidak ada")
  }

  const body = e.requestInfo().body

  const eventId = String(body.event_id || "").trim()
  const busId = String(body.bus_id || "").trim()
  const tripId = String(body.trip_id || "").trim()
  const stopId = String(body.stop_id || "").trim()
  const jenis = String(body.jenis || "").trim()

  if (!eventId || !busId || !tripId || !stopId) {
    throw new BadRequestError("event_id, bus_id, trip_id, stop_id wajib diisi")
  }
  if (jenis !== "board" && jenis !== "alight") {
    throw new BadRequestError("jenis harus 'board' atau 'alight'")
  }

  const kategori = (p) => (p >= 100 ? "penuh" : p >= 70 ? "ramai" : p >= 40 ? "sedang" : "lengang")

  const findOcc = (app) => {
    try {
      return app.findFirstRecordByFilter("occupancy", "bus = {:b}", { b: busId })
    } catch (_) {
      return null
    }
  }

  let result = null

  e.app.runInTransaction((txApp) => {
    // 1. Idempoten: event_id yang sudah ada tidak dihitung ulang
    let dup = null
    try {
      dup = txApp.findFirstRecordByFilter("passenger_events", "event_id = {:id}", { id: eventId })
    } catch (_) {}
    if (dup) {
      const occ = findOcc(txApp)
      result = {
        duplicate: true,
        bus_id: busId,
        current: occ ? occ.getInt("current") : 0,
        percentage: occ ? occ.getFloat("percentage") : 0,
        category: occ ? occ.getString("category") : "lengang",
      }
      return
    }

    // 2. Validasi bus, trip, dan halte
    let bus, trip
    try {
      bus = txApp.findRecordById("buses", busId)
    } catch (_) {
      throw new BadRequestError("bus tidak ditemukan")
    }
    try {
      trip = txApp.findRecordById("trips", tripId)
    } catch (_) {
      throw new BadRequestError("trip tidak ditemukan")
    }
    if (trip.getString("bus") !== busId) {
      throw new BadRequestError("trip tidak milik bus ini")
    }
    if (trip.getString("status") !== "ongoing") {
      throw new BadRequestError("trip sudah selesai")
    }
    try {
      txApp.findRecordById("stops", stopId)
    } catch (_) {
      throw new BadRequestError("halte tidak ditemukan")
    }

    // 3. Hitung okupansi: sekarang = sebelumnya + naik - turun
    let occ = findOcc(txApp)
    if (!occ) {
      occ = new Record(txApp.findCollectionByNameOrId("occupancy"))
      occ.set("bus", busId)
      occ.set("current", 0)
    }
    let current = occ.getInt("current")
    if (jenis === "board") {
      current += 1
    } else {
      if (current <= 0) {
        throw new BadRequestError("tidak ada penumpang di bus, turun ditolak")
      }
      current -= 1
    }

    const capacity = bus.getInt("capacity")
    const percentage = Math.round((current / capacity) * 1000) / 10

    occ.set("trip", tripId)
    occ.set("current", current)
    occ.set("percentage", percentage)
    occ.set("category", kategori(percentage))
    txApp.save(occ)

    // 4. Catat event
    const ev = new Record(txApp.findCollectionByNameOrId("passenger_events"))
    ev.set("event_id", eventId)
    ev.set("bus", busId)
    ev.set("trip", tripId)
    ev.set("stop", stopId)
    ev.set("jenis", jenis)
    ev.set("waktu", new Date().toISOString())
    txApp.save(ev)

    result = {
      duplicate: false,
      bus_id: busId,
      current: current,
      percentage: percentage,
      category: kategori(percentage),
    }
  })

  return e.json(200, result)
})

// Posisi GPS terakhir bus (satu record per bus, di-update terus)
routerAdd("POST", "/api/bisin/location", (e) => {
  const key = $os.getenv("BISIN_API_KEY")
  if (!key || e.request.header.get("X-API-Key") !== key) {
    throw new UnauthorizedError("API key salah atau tidak ada")
  }

  const body = e.requestInfo().body

  const busId = String(body.bus_id || "").trim()
  const lat = Number(body.latitude)
  const lng = Number(body.longitude)

  if (!busId) throw new BadRequestError("bus_id wajib diisi")
  if (body.latitude == null || body.longitude == null || !isFinite(lat) || !isFinite(lng)) {
    throw new BadRequestError("latitude dan longitude wajib berupa angka")
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BadRequestError("koordinat di luar rentang")
  }

  try {
    e.app.findRecordById("buses", busId)
  } catch (_) {
    throw new BadRequestError("bus tidak ditemukan")
  }

  let rec = null
  try {
    rec = e.app.findFirstRecordByFilter("bus_locations", "bus = {:b}", { b: busId })
  } catch (_) {}
  if (!rec) {
    rec = new Record(e.app.findCollectionByNameOrId("bus_locations"))
    rec.set("bus", busId)
  }
  rec.set("latitude", lat)
  rec.set("longitude", lng)
  if (body.speed != null && isFinite(Number(body.speed))) {
    rec.set("speed", Number(body.speed))
  }
  e.app.save(rec)

  return e.json(200, { ok: true })
})

// Perkiraan kedatangan bus di sebuah halte (publik, hanya baca)
routerAdd("GET", "/api/bisin/arrivals", (e) => {
  const stopId = String(e.request.url.query().get("stop_id") || "").trim()
  if (!stopId) throw new BadRequestError("stop_id wajib diisi")

  let stop
  try {
    stop = e.app.findRecordById("stops", stopId)
  } catch (_) {
    throw new NotFoundError("halte tidak ditemukan")
  }
  const stopLat = stop.getFloat("latitude")
  const stopLng = stop.getFloat("longitude")

  const first = (col, filter, params) => {
    try {
      return e.app.findFirstRecordByFilter(col, filter, params)
    } catch (_) {
      return null
    }
  }

  // jarak garis lurus (km)
  const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371
    const rad = (d) => (d * Math.PI) / 180
    const dLat = rad(lat2 - lat1)
    const dLng = rad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return 2 * R * Math.asin(Math.sqrt(a))
  }

  // rute yang melewati halte ini
  const links = e.app.findRecordsByFilter("route_stops", "stop = {:s}", "", 100, 0, { s: stopId })
  const arrivals = []

  links.forEach((link) => {
    const routeId = link.getString("route")
    const route = e.app.findRecordById("routes", routeId)
    const trips = e.app.findRecordsByFilter(
      "trips",
      "route = {:r} && status = 'ongoing'",
      "",
      100,
      0,
      { r: routeId }
    )

    trips.forEach((trip) => {
      const busId = trip.getString("bus")
      const bus = e.app.findRecordById("buses", busId)
      const loc = first("bus_locations", "bus = {:b}", { b: busId })
      if (!loc) return // belum ada posisi, lewati

      const distKm = haversine(loc.getFloat("latitude"), loc.getFloat("longitude"), stopLat, stopLng)
      let speed = loc.getFloat("speed")
      if (!speed || speed < 10) speed = 25
      const etaMinutes = Math.max(0, Math.ceil((distKm / speed) * 60))

      const occ = first("occupancy", "bus = {:b}", { b: busId })

      arrivals.push({
        bus_id: busId,
        plate: bus.getString("plate"),
        route: {
          id: routeId,
          code: route.getString("code"),
          name: route.getString("name"),
          color: route.getString("color"),
        },
        distance_km: Math.round(distKm * 100) / 100,
        eta_minutes: etaMinutes,
        occupancy: {
          current: occ ? occ.getInt("current") : 0,
          capacity: bus.getInt("capacity"),
          percentage: occ ? occ.getFloat("percentage") : 0,
          category: occ ? occ.getString("category") : "lengang",
          updated: occ ? String(occ.get("updated")) : null,
        },
      })
    })
  })

  arrivals.sort((a, b) => a.eta_minutes - b.eta_minutes)

  return e.json(200, {
    stop: { id: stopId, name: stop.getString("name") },
    arrivals: arrivals,
  })
})

// GET /api/bisin/analytics  (khusus operator)
routerAdd("GET", "/api/bisin/analytics", (e) => {
  if (e.auth.getString("role") !== "operator") {
    throw new ForbiddenError("Hanya operator yang boleh melihat analitik")
  }

  const perHalteRows = arrayOf(new DynamicModel({
    stop_id: "", nama: "", jenis: "", total: 0,
  }))
  $app.db().newQuery(
    "SELECT e.stop AS stop_id, COALESCE(s.name, '') AS nama, e.jenis AS jenis, COUNT(*) AS total " +
    "FROM passenger_events e LEFT JOIN stops s ON s.id = e.stop " +
    "GROUP BY e.stop, e.jenis"
  ).all(perHalteRows)

  const perJamRows = arrayOf(new DynamicModel({
    jam: "", jenis: "", total: 0,
  }))
  $app.db().newQuery(
    "SELECT strftime('%H', e.waktu, '+7 hours') AS jam, e.jenis AS jenis, COUNT(*) AS total " +
    "FROM passenger_events e GROUP BY jam, e.jenis"
  ).all(perJamRows)

  const halte = {}
  perHalteRows.forEach((r) => {
    if (!halte[r.stop_id]) halte[r.stop_id] = { stop_id: r.stop_id, nama: r.nama, naik: 0, turun: 0 }
    if (r.jenis === "board") halte[r.stop_id].naik = r.total
    else halte[r.stop_id].turun = r.total
  })

  const jam = {}
  perJamRows.forEach((r) => {
    if (!jam[r.jam]) jam[r.jam] = { jam: r.jam + ":00", naik: 0, turun: 0 }
    if (r.jenis === "board") jam[r.jam].naik = r.total
    else jam[r.jam].turun = r.total
  })

  return e.json(200, {
    per_halte: Object.values(halte),
    per_jam: Object.values(jam).sort((a, b) => (a.jam < b.jam ? -1 : 1)),
  })
}, $apis.requireAuth("users"))