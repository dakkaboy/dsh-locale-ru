#requires -Version 5.1
<#
.SYNOPSIS
  Удаляет русификатор dsh-locale-ru из профиля DeepSeek Harness.

.DESCRIPTION
  Убирает запись из cordis.patch.yml, зависимость профиля, ссылку в node_modules
  и сам каталог плагина. Сама программа не затрагивается.

.PARAMETER Profile
  Имя профиля DSH (по умолчанию desktop).

.PARAMETER DshHome
  Каталог DSH_HOME (по умолчанию $env:DSH_HOME или %USERPROFILE%\.dsh).

.EXAMPLE
  irm https://github.com/dakkaboy/dsh-locale-ru/releases/latest/download/uninstall.ps1 | iex
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$DshHome
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

function Remove-PatchEntry($path) {
  if (-not (Test-Path $path)) { return }
  $text = [IO.File]::ReadAllText($path)
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
  Write-Step 'удалён из cordis.patch.yml'
}

function Remove-ManifestEntry($path) {
  if (-not (Test-Path $path)) { return }
  $pkg = Get-Content $path -Raw | ConvertFrom-Json
  if ($null -eq $pkg.PSObject.Properties['dependencies']) { return }
  if ($null -eq $pkg.dependencies.PSObject.Properties[$PluginName]) { return }
  $pkg.dependencies.PSObject.Properties.Remove($PluginName)
  ($pkg | ConvertTo-Json -Depth 20) + "`n" | Set-Content -Path $path -NoNewline -Encoding utf8
  Write-Step 'удалена зависимость профиля'
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

$dshHome = Resolve-DshHome
$profileDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
if (-not (Test-Path $profileDir)) { Fail "профиль DSH не найден: $profileDir" }

Write-Host "Удаление $PluginName из профиля '$Profile'"
Remove-PatchEntry (Join-Path $profileDir 'cordis.patch.yml')
Remove-ManifestEntry (Join-Path $profileDir 'package.json')
Remove-Link (Join-Path (Join-Path $profileDir 'node_modules') $PluginName)
$pluginDir = Join-Path (Join-Path $profileDir 'plugins') $PluginName
if (Test-Path $pluginDir) { Remove-Item $pluginDir -Recurse -Force; Write-Step 'удалены файлы плагина' }

Write-Host ''
Write-Host 'Готово. Обновите окно DSH (F5).' -ForegroundColor Green
