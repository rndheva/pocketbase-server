param([string]$Base = "http://127.0.0.1:8090")

function Get-Items($path) {
  @((Invoke-RestMethod "$Base/api/collections/$path").items)
}

$routes = Get-Items "routes/records?perPage=100&sort=code"
$stops  = Get-Items "stops/records?perPage=200&sort=created,id"
$rs     = Get-Items "route_stops/records?perPage=200&sort=sequence&expand=route,stop"
$buses  = Get-Items "buses/records?perPage=100&sort=plate&expand=route"

$data = [ordered]@{
  routes = @($routes | ForEach-Object { [ordered]@{ code = $_.code; name = $_.name; color = $_.color } })
  stops  = @($stops  | ForEach-Object { [ordered]@{ name = $_.name; latitude = [double]$_.latitude; longitude = [double]$_.longitude } })
  route_stops = @($rs | ForEach-Object { [ordered]@{ route = $_.expand.route.code; stop = $_.expand.stop.name; sequence = [int]$_.sequence } })
  buses  = @($buses | ForEach-Object { [ordered]@{ plate = $_.plate; route = $_.expand.route.code; capacity = [int]$_.capacity } })
}

$out = Join-Path $PSScriptRoot "seed-data.json"
$data | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $out
Write-Host "Diekspor: $($data.routes.Count) rute, $($data.stops.Count) halte, $($data.route_stops.Count) route_stops, $($data.buses.Count) bus -> $out"