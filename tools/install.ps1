#requires -Version 5.1
<#
.SYNOPSIS
  Устанавливает русификатор dsh-locale-ru в профиль DeepSeek Harness.

.DESCRIPTION
  Скачивает пакет из GitHub Releases, кладёт его в <DSH_HOME>\profiles\<Profile>\plugins\dsh-locale-ru,
  связывает с node_modules профиля и включает плагин в cordis.patch.yml.
  Ничего не патчит в самой программе; откат — uninstall.ps1 или ключ -Uninstall.

.PARAMETER Profile
  Имя профиля DSH. По умолчанию desktop (настольное приложение); для CLI используйте web.

.PARAMETER DshHome
  Каталог DSH_HOME. По умолчанию переменная окружения DSH_HOME или %USERPROFILE%\.dsh.

.PARAMETER Version
  Тег релиза (например v1.0.0) или latest.

.PARAMETER Repo
  Репозиторий GitHub, откуда берётся пакет.

.EXAMPLE
  irm https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/install.ps1 | iex

.EXAMPLE
  .\install.ps1 -Profile web -Version v1.0.0
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$DshHome,
  [string]$Version = 'latest',
  [string]$Repo = 'dakkaboy/dsh-locale-ru',
  [string]$AssetUrl,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$PluginName = 'dsh-locale-ru'
$Marker = '# Russian interface (dsh-locale-ru)'

function Write-Step($text) { Write-Host "  $text" }
function Fail($text) { Write-Host "Ошибка: $text" -ForegroundColor Red; exit 1 }

function Resolve-DshHome {
  if ($DshHome) {
    if (-not (Test-Path $DshHome)) { Fail "каталог DSH_HOME не найден: $DshHome" }
    return (Resolve-Path $DshHome).Path
  }
  if ($env:DSH_HOME) { return $env:DSH_HOME }
  return (Join-Path $env:USERPROFILE '.dsh')
}

function Read-PatchFile($path) {
  if (-not (Test-Path $path)) { return '' }
  return [IO.File]::ReadAllText($path)
}

function Add-PatchEntry($path) {
  $text = Read-PatchFile $path
  if ($text.Contains($Marker)) { Write-Step "запись в cordis.patch.yml уже есть"; return }
  $block = "$Marker`n- insert:`n    - id: locale-ru`n      name: $PluginName`n"
  if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`n" }
  [IO.File]::WriteAllText($path, $text + $block)
  Write-Step "включён в cordis.patch.yml"
}

function Remove-PatchEntry($path) {
  $text = Read-PatchFile $path
  if (-not $text.Contains($Marker)) { return }
  $start = $text.IndexOf($Marker)
  $rest = $text.Substring($start)
  # блок заканчивается перед следующей записью верхнего уровня или в конце файла
  $firstBreak = $rest.IndexOf("`n")
  $tail = ''
  if ($firstBreak -ge 0) {
    $match = [regex]::Match($rest.Substring($firstBreak + 1), "`n(?=- )")
    if ($match.Success) { $tail = $rest.Substring($firstBreak + 1 + $match.Index + 1) }
  }
  [IO.File]::WriteAllText($path, $text.Substring(0, $start) + $tail)
  Write-Step "удалён из cordis.patch.yml"
}

function Update-Manifest($path, [bool]$add) {
  $pkg = Get-Content $path -Raw | ConvertFrom-Json
  if (-not $pkg.PSObject.Properties['dependencies']) {
    $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue (New-Object psobject)
  }
  $spec = 'file:./plugins/' + $PluginName
  $has = $null -ne $pkg.dependencies.PSObject.Properties[$PluginName]
  if ($add -and -not $has) {
    $pkg.dependencies | Add-Member -NotePropertyName $PluginName -NotePropertyValue $spec
    Write-Step "добавлена зависимость $PluginName"
  } elseif (-not $add -and $has) {
    $pkg.dependencies.PSObject.Properties.Remove($PluginName)
    Write-Step "удалена зависимость $PluginName"
  }
  ($pkg | ConvertTo-Json -Depth 20) + "`n" | Set-Content -Path $path -NoNewline -Encoding utf8
}

function Remove-Link($link) {
  if (-not (Test-Path $link)) { return }
  $item = Get-Item $link -Force
  if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
    [IO.Directory]::Delete($link)
  } else {
    Remove-Item $link -Recurse -Force
  }
}

function Get-BundleNames($path) {
  if (-not (Test-Path $path)) { return @() }
  $pkg = Get-Content $path -Raw | ConvertFrom-Json
  if ($null -eq $pkg.dsh -or $null -eq $pkg.dsh.profile -or $null -eq $pkg.dsh.profile.bundles) { return @() }
  return @($pkg.dsh.profile.bundles)
}

function Remove-BundleEntry($path) {
  $bundles = Get-BundleNames $path
  if (-not ($bundles -contains $PluginName)) { return }
  $pkg = Get-Content $path -Raw | ConvertFrom-Json
  $pkg.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne $PluginName })
  ($pkg | ConvertTo-Json -Depth 20) + "`n" | Set-Content -Path $path -NoNewline -Encoding utf8
  Write-Step "удалён из dsh.profile.bundles"
}

$dshHome = Resolve-DshHome
$profileDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$manifestPath = Join-Path $profileDir 'package.json'
$pluginDir = Join-Path (Join-Path $profileDir 'plugins') $PluginName
$linkPath = Join-Path (Join-Path $profileDir 'node_modules') $PluginName

if (-not (Test-Path $profileDir)) {
  Fail "профиль DSH не найден: $profileDir`nЗапустите DeepSeek Harness хотя бы раз или укажите -Profile/-DshHome."
}

if (-not $Uninstall -and ((Get-BundleNames $manifestPath) -contains $PluginName)) {
  Write-Host "Русификатор уже установлен как bundle '$PluginName' в профиле '$Profile'." -ForegroundColor Yellow
  Write-Host 'Обновите окно DSH (F5). Удалить: uninstall.ps1'
  exit 0
}

if ($Uninstall) {
  Write-Host "Удаление $PluginName из профиля '$Profile' ($profileDir)"
  Remove-PatchEntry $patchPath
  if (Test-Path $manifestPath) {
    Remove-BundleEntry $manifestPath
    Update-Manifest $manifestPath $false
  }
  Remove-Link $linkPath
  if (Test-Path $pluginDir) { Remove-Item $pluginDir -Recurse -Force }
  Write-Step "готово. Перезагрузите окно DSH (F5)."
  exit 0
}

if (-not $AssetUrl) {
  $AssetUrl = if ($Version -eq 'latest') {
    "https://github.com/$Repo/releases/latest/download/$PluginName.tgz"
  } else {
    "https://github.com/$Repo/releases/download/$Version/$PluginName.tgz"
  }
}
$assetUrl = $AssetUrl

Write-Host "Установка русификатора DeepSeek Harness"
Write-Step "профиль: $profileDir"
Write-Step "пакет:   $assetUrl"

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("$PluginName-" + [guid]::NewGuid().ToString('N'))
$tgz = Join-Path $tempRoot "$PluginName.tgz"
try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  Write-Step 'скачивание…'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $assetUrl -OutFile $tgz -UseBasicParsing
  } catch {
    Fail "не удалось скачать пакет: $($_.Exception.Message)"
  }

  Write-Step 'распаковка…'
  & tar -xzf $tgz -C $tempRoot
  if ($LASTEXITCODE -ne 0) { Fail 'не удалось распаковать архив (нужен tar из Windows 10+).' }
  $extracted = Join-Path $tempRoot 'package'
  if (-not (Test-Path (Join-Path $extracted 'lib\client.js'))) { Fail 'в архиве нет lib/client.js' }

  if (Test-Path $pluginDir) { Remove-Item $pluginDir -Recurse -Force }
  New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
  Copy-Item (Join-Path $extracted '*') $pluginDir -Recurse -Force
  Write-Step "файлы:   $pluginDir"

  Remove-Link $linkPath
  New-Item -ItemType Directory -Path (Split-Path $linkPath) -Force | Out-Null
  New-Item -ItemType Junction -Path $linkPath -Target $pluginDir | Out-Null
  Write-Step "ссылка:  $linkPath"

  Add-PatchEntry $patchPath
  Update-Manifest $manifestPath $true

  Write-Host ""
  Write-Host "Готово. Интерфейс переключится после обновления окна (F5)." -ForegroundColor Green
  Write-Host "Если язык не переключился сам: Настройки -> Общие -> Язык -> «Русский»."
  Write-Host "Удалить: irm https://github.com/$Repo/releases/latest/download/uninstall.ps1 | iex"
} finally {
  if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
