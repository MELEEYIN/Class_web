# check-domain.ps1 — leeyin.xyz 域名接入进度一键体检
#
# 用法（在仓库根目录，Windows PowerShell 5.1 或 PowerShell 7 都可以）：
#   powershell -ExecutionPolicy Bypass -File .\check-domain.ps1
#
# 它会依次检查 5 件事，最后给出「你现在该做哪一步」的结论。配合 DOMAIN_SETUP.md 使用。
#
# 注意：本文件必须保存为 UTF-8 with BOM。
# Windows PowerShell 5.1 在读取没有 BOM 的 .ps1 时会按 GBK 解码，中文会乱码并导致语法错误。

# Windows PowerShell 5.1 默认只启用 TLS 1.0/1.1，会导致访问 RDAP 等现代 HTTPS 服务失败。
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$domain  = 'leeyin.xyz'
$www     = "www.$domain"
$verdict = New-Object System.Collections.ArrayList

function Section($t) {
  Write-Host ''
  Write-Host "=== $t ===" -ForegroundColor Cyan
}
function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [..]   $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Note($m) { Write-Host "  $m" -ForegroundColor Gray }

# 判断是不是 Cloudflare 的 IP 段
function Test-CloudflareIP($ip) {
  return $ip -match '^(104\.(1[6-9]|2[0-7])\.|172\.6[4-9]\.|172\.7[0-1]\.|188\.114\.|190\.93\.|197\.234\.|198\.41\.|162\.15[89]\.|173\.245\.|103\.2[1-2]\.|141\.101\.)'
}

# curl 退出码 -> 人话
function Explain-CurlExit($code) {
  switch ($code) {
    6  { return '无法解析域名（DNS 还没有这条记录）' }
    7  { return '连不上服务器（TCP 被拒或被阻断）' }
    28 { return '超时' }
    35 { return 'TLS 握手失败（可能被干扰/阻断）' }
    56 { return '接收数据失败（连接被重置）' }
    60 { return '证书校验失败' }
    default { return "curl 退出码 $code" }
  }
}

# 取 RDAP 数据（Invoke-RestMethod 失败时回退用 curl，因为 curl 不受 PS 的 TLS 默认值影响）
function Get-Rdap {
  $u = "https://rdap.centralnic.com/xyz/domain/$domain"
  try {
    return Invoke-RestMethod -Uri $u -TimeoutSec 25
  } catch {
    $firstErr = $_.Exception.Message
    $c = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($c) {
      $json = & curl.exe -s --max-time 25 $u 2>$null
      if ($json -and $json -notmatch '^\s*$') {
        try { return ($json | Out-String | ConvertFrom-Json) } catch { }
      }
    }
    throw "Invoke-RestMethod 失败：$firstErr"
  }
}

# ---------------------------------------------------------------- 1. 注册局状态
Section "1) 注册局原始状态（RDAP，最权威）"
try {
  $rdap = Get-Rdap
  Note ("status      : " + ($rdap.status -join ', '))
  Note ("nameservers : " + (($rdap.nameservers | ForEach-Object { $_.ldhName }) -join ', '))
  Note ("expiration  : " + (($rdap.events | Where-Object { $_.eventAction -eq 'expiration' }).eventDate))

  $holds = @($rdap.status | Where-Object { $_ -match 'hold' })
  if ($holds.Count -gt 0) {
    Bad "域名被锁定：$($holds -join ', ')"
    [void]$verdict.Add("去阿里云解除锁定（当前：$($holds -join ', ')）→ DOMAIN_SETUP.md 第 0 步")
  } else {
    Ok "注册局没有 hold，域名未被锁定"
  }

  $nsNames = @($rdap.nameservers | ForEach-Object { $_.ldhName })
  if ($nsNames -match 'cloudflare') {
    Ok "注册局记录里的 NS 已经是 Cloudflare"
  } else {
    Warn "注册局记录里的 NS 还是：$($nsNames -join ', ')"
    [void]$verdict.Add("去阿里云把 NS 换成 Cloudflare 给的那两个（现在是 $($nsNames -join ', ')）→ DOMAIN_SETUP.md 第 2 步")
  }
} catch {
  Bad "RDAP 查询失败：$_"
  Note "本机网络无法直连 rdap.centralnic.com（国内网络常见，不是脚本问题）"
  Note "替代方案：用阿里云 whois 查域名状态 -> https://whois.aliyun.com/"
  Note "（这一项失败不影响下面 2~5 项，那几项走国内可用的 DNS 查询）"
}

# ------------------------------------------------- 2. 权威 TLD 服务器（绕过所有缓存）
Section "2) 权威 TLD 委派查询（绕开全部缓存，判断委派是否已发布）"
$authOut = ''
try { $authOut = (nslookup -type=ns $domain x.nic.xyz 2>&1 | Out-String) } catch { }
if ($authOut -match 'Non-existent domain|NXDOMAIN') {
  Bad "注册局的权威服务器返回 Non-existent domain"
  Note "→ .xyz 注册局还没有发布 $domain 的委派记录，全世界都查不到它"
  Note "→ 如果你还没改 NS：这是正常的，改 NS 会触发发布"
} elseif ($authOut -match 'nameserver\s*=') {
  $authNs = ([regex]::Matches($authOut, '(?im)nameserver\s*=\s*(\S+)') | ForEach-Object { $_.Groups[1].Value }) -join ', '
  Ok "委派已发布，权威服务器记录：$authNs"
} else {
  Warn "权威查询结果无法识别，原始输出："
  Note $authOut.Trim()
}

# ------------------------------------------------------------ 3. 公共解析器查 NS
Section "3) 公共解析器查 NS（1.1.1.1）"
try {
  $ns = @(Resolve-DnsName -Name $domain -Type NS -Server 1.1.1.1 -ErrorAction Stop |
          Where-Object { $_.NameHost } | ForEach-Object { $_.NameHost })
  if ($ns.Count -gt 0) {
    $ns | ForEach-Object { Note $_ }
    if ($ns -match 'cloudflare') { Ok "NS 已指向 Cloudflare" }
    else { Warn "NS 还是旧的：$($ns -join ', ')" }
  } else {
    Bad "没查到 NS 记录"
  }
} catch {
  Bad "查不到：$($_.Exception.Message)"
  [void]$verdict.Add("DNS 仍解析不到 → 确认 NS 是否已在阿里云改好 → DOMAIN_SETUP.md 第 2 步")
}

# -------------------------------------------------------------- 4. A 记录解析
Section "4) 解析结果（A 记录）"
foreach ($n in @($domain, $www)) {
  try {
    $a = @(Resolve-DnsName -Name $n -Type A -Server 1.1.1.1 -ErrorAction Stop |
           Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
    if ($a.Count -gt 0) {
      Ok "$n -> $($a -join ', ')"
      if (@($a | Where-Object { Test-CloudflareIP $_ }).Count -gt 0) { Note "   ↑ 是 Cloudflare 的 IP 段" }
    } else {
      Warn "$n 没有 A 记录"
    }
  } catch {
    Warn "$n 解析不到：$($_.Exception.Message)"
  }
}

# ---------------------------------------------------------------- 5. HTTPS 可达性
Section "5) HTTPS 可达性实测（本机直连，无代理）"
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) {
  Warn "本机没有 curl.exe，跳过此项"
} else {
  foreach ($u in @("https://$domain", "https://$www")) {
    $code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 20 $u 2>$null
    $ec   = $LASTEXITCODE
    if ($ec -eq 0 -and $code -and $code -ne '000') {
      Ok "$u -> HTTP $code"
    } else {
      Bad "$u -> 连不上（$(Explain-CurlExit $ec)；curl exit=$ec）"
    }
  }
  Note "提示：exit 6 说明 DNS 还没生效；exit 35/56 才是 TLS 被干扰（国内线路常见），"
  Note "      后者不代表你配置错了，挂代理再测一次就能区分「配置问题」和「线路问题」。"
}

# -------------------------------------------------------------------- 结论
Write-Host ''
Write-Host '================ 体检结论 ================' -ForegroundColor Magenta
if ($verdict.Count -eq 0) {
  Write-Host ' 全部关键检查通过 🎉' -ForegroundColor Green
} else {
  $i = 1
  foreach ($v in $verdict) {
    Write-Host (" {0}. {1}" -f $i, $v) -ForegroundColor Yellow
    $i++
  }
}
Write-Host '==========================================' -ForegroundColor Magenta
Write-Host ''
Write-Host '详细步骤见 DOMAIN_SETUP.md' -ForegroundColor Gray
