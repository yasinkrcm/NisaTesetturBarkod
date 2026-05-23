$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$assetsDir = "c:\Users\yasin\OneDrive\Masaüstü\YAZILIM\NisaTesetturBarkod\assets"
if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }

Write-Host "Downloading TailwindCSS..."
Invoke-WebRequest -Uri "https://cdn.tailwindcss.com" -OutFile "$assetsDir\tailwindcss.js"

Write-Host "Downloading JsBarcode..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" -OutFile "$assetsDir\jsbarcode.min.js"

Write-Host "Downloading FontAwesome..."
$faDir = "$assetsDir\fontawesome"
if (!(Test-Path $faDir)) { New-Item -ItemType Directory -Path $faDir | Out-Null }
$faCssDir = "$faDir\css"
$faWebfontsDir = "$faDir\webfonts"
if (!(Test-Path $faCssDir)) { New-Item -ItemType Directory -Path $faCssDir | Out-Null }
if (!(Test-Path $faWebfontsDir)) { New-Item -ItemType Directory -Path $faWebfontsDir | Out-Null }

Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" -OutFile "$faCssDir\all.min.css"

$faFonts = @(
    "fa-solid-900.woff2",
    "fa-regular-400.woff2",
    "fa-brands-400.woff2",
    "fa-v4compatibility.woff2"
)
foreach ($font in $faFonts) {
    Write-Host "  Downloading $font..."
    Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/$font" -OutFile "$faWebfontsDir\$font"
}

Write-Host "Downloading Google Fonts..."
$fontsDir = "$assetsDir\fonts"
if (!(Test-Path $fontsDir)) { New-Item -ItemType Directory -Path $fontsDir | Out-Null }

# Helper to download font css, extract woff2 URLs, download them, and rewrite css
function Download-GoogleFont {
    param ($Name, $Url, $CssFileName)
    
    Write-Host "  Downloading CSS for $Name..."
    $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36" }
    $css = (Invoke-WebRequest -Uri $Url -Headers $headers).Content

    $pattern = "url\((https://[^)]+\.woff2)\)"
    $matches = [regex]::Matches($css, $pattern)
    
    $i = 1
    foreach ($m in $matches) {
        $fontUrl = $m.Groups[1].Value
        $fileName = "$($Name.ToLower())-$i.woff2"
        Write-Host "    Downloading $fileName..."
        Invoke-WebRequest -Uri $fontUrl -OutFile "$fontsDir\$fileName"
        
        # Replace URL in CSS
        $css = $css.Replace($fontUrl, "./$fileName")
        $i++
    }
    
    Set-Content -Path "$fontsDir\$CssFileName" -Value $css
}

Download-GoogleFont -Name "Inter" -Url "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" -CssFileName "inter.css"
Download-GoogleFont -Name "Poppins" -Url "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" -CssFileName "poppins.css"

Write-Host "All assets downloaded successfully!"
