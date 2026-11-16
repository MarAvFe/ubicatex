# Undoes lan-open.ps1: removes the port forward and the firewall rule. Run as administrator.
# A log, because an elevated window closes before anyone can read it.
Start-Transcript -Path "$env:TEMP\ubicate-lan.log" -Force | Out-Null
$port = 8000
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
Get-NetFirewallRule -DisplayName 'Ubicate dev server (port 8000, home network only)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'Port 8000 is closed to the network again.'
Stop-Transcript | Out-Null
