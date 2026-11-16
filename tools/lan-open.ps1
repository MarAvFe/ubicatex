# Lets phones on the home network open the game served from WSL on port 8000.
# Run in Windows PowerShell as administrator. Undo with lan-close.ps1.
# Run it again after restarting the PC: WSL gets a new internal address each boot.
# A log, because an elevated window closes before anyone can read it.
Start-Transcript -Path "$env:TEMP\ubicate-lan.log" -Force | Out-Null
$ErrorActionPreference = 'Stop'
$port = 8000
$rule = 'Ubicate dev server (port 8000, home network only)'

$wslIp = ((wsl.exe hostname -I) -split '\s+')[0]
if (-not $wslIp) { throw 'WSL is not running: open an Ubuntu terminal first.' }

# Windows listens on every address and hands the connection to WSL.
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp | Out-Null

# LocalSubnet: only devices on the same network may connect, never the internet.
# All profiles, because Windows has this network marked as Public.
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port `
        -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
}

$lan = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { $_.IPv4Address.IPAddress }
Write-Host "WSL $wslIp forwarded. On the phone, open:"
$lan | ForEach-Object { Write-Host "  http://${_}:$port/" }
Stop-Transcript | Out-Null
