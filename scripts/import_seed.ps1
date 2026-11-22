param([string]$Base = "http://127.0.0.1:8090")
$ErrorActionPreference = "Stop"

$data = Get-Content (Join-Path $PSScriptRoot "seed-data.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$email = Read-Host "Email superuser"
$pw = Read-Host "Password" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
$auth = Invoke-RestMethod -Method Post -Uri "$Base/api/collections/_superusers/auth-with-password" `
  -ContentType "application/json" -Body (@{ identity = $email; password = $plain } | ConvertTo-Json)
$h = @{ Authorization = $auth.token }

function Add-Record($col, $obj) {
  $json = $obj | ConvertTo-Json
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method Post -Headers $h -Uri "$Base/api/collections/$col/records" `
    -ContentType "application/json; charset=utf-8" -Body $bytes
}

$existing = Invoke-RestMethod -Headers $h "$Base/api/collections/routes/records?perPage=1"
if ($existing.totalItems -gt 0) { Write-Host "routes sudah berisi data. Dibatalkan."; return }

$routeId = @{}
$stopId = @{}

foreach ($r in $data.routes) {
  $rec = Add-Record "routes" @{ code = $r.code; name = $r.name; color = $r.color }
  $routeId[$r.code] = $rec.id
}
foreach ($s in $data.stops) {
  $rec = Add-Record "stops" @{ name = $s.name; latitude = $s.latitude; longitude = $s.longitude }
  $stopId[$s.name] = $rec.id
}
foreach ($x in $data.route_stops) {
  Add-Record "route_stops" @{ route = $routeId[$x.route]; stop = $stopId[$x.stop]; sequence = $x.sequence } | Out-Null
}
foreach ($b in $data.buses) {
  $rec = Add-Record "buses" @{ plate = $b.plate; route = $routeId[$b.route]; capacity = $b.capacity }
  Add-Record "trips" @{ bus = $rec.id; route = $routeId[$b.route]; status = "ongoing" } | Out-Null
  Write-Host "Bus $($b.plate) + trip ongoing"
}
Write-Host "Impor selesai: $($data.routes.Count) rute, $($data.stops.Count) halte, $($data.buses.Count) bus."