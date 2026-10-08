# Windows text recognition worker for the desktop app (electron/ocrEngines.cjs starts it once and keeps it).
# Reads lines "<language tag>|<png path>" on stdin; answers each with one JSON line:
#   { words: [{ text, x, y, w, h }], ms, width, height }  or  { error }
# The first line out is { ready, languages } and lists the OCR languages installed in Windows.
# Uses Windows.Media.Ocr, the engine built into Windows; nothing is installed and nothing leaves the PC.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$engines = @{}
function Get-Engine($tag) {
  if (-not $engines.ContainsKey($tag)) {
    $engines[$tag] = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $tag))
  }
  $engines[$tag]
}

$languages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag })
[Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ ready = $true; languages = $languages }))
[Console]::Out.Flush()

while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $tag, $path = $line.Split('|', 2)
    $engine = Get-Engine $tag
    if ($null -eq $engine) { throw "Windows has no text recognition for '$tag'. Installed: $($languages -join ', ')" }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $words = @()
    foreach ($l in $result.Lines) {
      foreach ($w in $l.Words) {
        $r = $w.BoundingRect
        $words += @{ text = $w.Text; x = [math]::Round($r.X, 1); y = [math]::Round($r.Y, 1); w = [math]::Round($r.Width, 1); h = [math]::Round($r.Height, 1) }
      }
    }
    $stream.Dispose()
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 5 -InputObject @{ words = $words; ms = $watch.ElapsedMilliseconds; width = $bitmap.PixelWidth; height = $bitmap.PixelHeight }))
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ error = $_.Exception.Message }))
  }
  [Console]::Out.Flush()
}
