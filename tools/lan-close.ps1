# Undoes lan-open.ps1: removes the port forward and the firewall rule. Run as administrator.
$port = 8000
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
Get-NetFirewallRule -DisplayName 'Ubicate dev server (port 8000, home network only)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'Port 8000 is closed to the network again.'
