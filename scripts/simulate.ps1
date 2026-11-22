param(
  [string]$Base = "http://127.0.0.1:8090",
  [string]$ApiKey = $env:BISIN_API_KEY,
  [int]$TickMs = 1000,
  [int]$StepsPerLeg = 10
)

function Enc($s) { [uri]::EscapeDataString($s) }

function Err-Text($e) {
  $m = $e.ErrorDetails.Message
  if (-not $m) { $m = $e.Exception.Message }
  return $m
}

function Send-Json($path, $obj) {
  Invoke-RestMethod -Method Post -Uri "$Base$path" -ContentType "application/json" `
    -Headers @{ "X-API-Key" = $ApiKey } -Body ($obj | ConvertTo-Json)
}

function Send-Event($s, $stop, $jenis) {
  $body = @{
    event_id = "sim-" + [guid]::NewGuid().ToString()
    bus_id   = $s.bus.id
    trip_id  = $s.trip.id
    stop_id  = $stop.id
    jenis    = $jenis
  }
  try {
    $r = Send-Json "/api/bisin/events" $body
    $s.current = [int]$r.current
    $s.last = $r
  } catch {
    Write-Host "  ! $jenis ditolak: $(Err-Text $_)" -ForegroundColor Yellow
  }
}

# --- Siapkan data: trip ongoing, rute, halte berurutan ---
$trips = (Invoke-RestMethod "$Base/api/collections/trips/records?filter=$(Enc "status='ongoing'")&perPage=100").items
if (-not $trips) { throw "Tidak ada trip ongoing." }

$sims = @()
foreach ($t in $trips) {
  $rs = (Invoke-RestMethod "$Base/api/collections/route_stops/records?filter=$(Enc "route='$($t.route)'")&sort=sequence&expand=stop&perPage=100").items
  $pts = @($rs | ForEach-Object {
    [pscustomobject]@{
      id   = $_.expand.stop.id
      name = $_.expand.stop.name
      lat  = [double]$_.expand.stop.latitude
      lng  = [double]$_.expand.stop.longitude
    }
  })
  if ($pts.Count -lt 2) { continue }

  $bus = Invoke-RestMethod "$Base/api/collections/buses/records/$($t.bus)"

  # lanjutkan dari okupansi yang sudah ada (kalau ada)
  $occ = @((Invoke-RestMethod "$Base/api/collections/occupancy/records?filter=$(Enc "bus='$($bus.id)'")").items)
  $cur = 0
  if ($occ.Count -gt 0) { $cur = [int]$occ[0].current }

  # sebar posisi awal supaya bus di rute yang sama tidak menumpuk
  $start = ($sims.Count * 2) % ($pts.Count - 1)

  $sims += [pscustomobject]@{
    bus = $bus; trip = $t; stops = $pts
    idx = $start; dir = 1; step = 0; current = $cur; last = $null
  }
}

Write-Host "Simulasi jalan untuk $($sims.Count) bus. Tekan Ctrl+C untuk berhenti." -ForegroundColor Cyan

# --- Loop utama ---
while ($true) {
  foreach ($s in $sims) {
    $from = $s.stops[$s.idx]
    $nextIdx = $s.idx + $s.dir
    $to = $s.stops[$nextIdx]

    $s.step++
    $f = $s.step / $StepsPerLeg
    $lat = $from.lat + ($to.lat - $from.lat) * $f
    $lng = $from.lng + ($to.lng - $from.lng) * $f

    try {
      Send-Json "/api/bisin/location" @{
        bus_id = $s.bus.id; latitude = $lat; longitude = $lng
        speed = (Get-Random -Minimum 20 -Maximum 41)
      } | Out-Null
    } catch {
      Write-Host "  ! lokasi gagal: $(Err-Text $_)" -ForegroundColor Yellow
    }

    if ($s.step -ge $StepsPerLeg) {
      # tiba di halte berikutnya
      $s.idx = $nextIdx
      $s.step = 0
      $stop = $s.stops[$s.idx]
      $terminal = ($s.idx -eq 0) -or ($s.idx -eq $s.stops.Count - 1)

      if ($terminal) {
        $nAlight = $s.current
      } else {
        $nAlight = Get-Random -Minimum 0 -Maximum ([Math]::Min($s.current, 4) + 1)
      }
      for ($i = 0; $i -lt $nAlight; $i++) { Send-Event $s $stop "alight" }

      $room = [int]$s.bus.capacity - $s.current
      $nBoard = [Math]::Min((Get-Random -Minimum 0 -Maximum 7), $room)
      for ($i = 0; $i -lt $nBoard; $i++) { Send-Event $s $stop "board" }

      $cat = ""
      if ($s.last) { $cat = $s.last.category }
      $pct = [Math]::Round(100 * $s.current / [int]$s.bus.capacity, 1)
      Write-Host "[$($s.bus.plate)] $($stop.name): turun $nAlight, naik $nBoard -> $($s.current)/$($s.bus.capacity) ($pct%) $cat"

      # balik arah di ujung rute
      if (($s.idx + $s.dir -lt 0) -or ($s.idx + $s.dir -ge $s.stops.Count)) { $s.dir = -$s.dir }
    }
  }
  Start-Sleep -Milliseconds $TickMs
}