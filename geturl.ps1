# Достаёт ссылку trycloudflare.com из лога cloudflared
$c = Get-Content "$PSScriptRoot\cloudflared.log" -Raw -ErrorAction SilentlyContinue
if ($c -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $matches[0] }
