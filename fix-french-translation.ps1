# French Translation Fix Script
# This script converts French translation from formal (vous) to informal (tu) form

$filePath = "c:\Users\Lenovo\Desktop\Hypoteqfunnel-main\messages\fr.json"
$content = Get-Content $filePath -Raw -Encoding UTF8

# Define replacements (order matters - specific before general)
$replacements = @(
    # Specific verb forms
    @(" Obtenez ", " Obtiens "),
    @(" Comparez ", " Compare "),
    @(" calculez ", " calcule "),
    @(" lancez ", " lance "),
    @(" décidez ", " décide "),
    @(" accédez ", " accèdes "),
    @(" Trouvez ", " Trouve "),
    @(" Réservez ", " Réserve "),
    @(" voyez ", " vois "),
    @(" Déplacez ", " Déplace "),
    @(" Calculez ", " Calcule "),
    @(" Lancez ", " Lance "),
    @(" Commencez ", " Commence "),
    @(" Obtenez ", " Obtiens "),
    @(" Prenez ", " Prends "),
    @(" Découvrez ", " Découvre "),
    @(" Prends Ton ", " Prends ton "),
    @(" Commence Ton ", " Commence ton "),
    @(" montrons ", " montrons "),
    @(" vous montrons ", " te montrons "),
    @(" vous convient ", " te convient "),
    @(" vous donner ", " te donner "),
    @(" vous aider ", " t'aider "),
    @(" vous guidons ", " te guidons "),
    @(" vous accompagnons ", " t'accompagnons "),
    @(" vous soutenons ", " te soutenons "),
    @(" vous recevrez ", " tu recevras "),
    @(" vous ", " tu "),
    @(" Vous ", " Tu "),
    # Possessives
    @(" Votre ", " Ton "),
    @(" votre ", " ton "),
    @(" Vos ", " Tes "),
    @(" vos ", " tes "),
    @(" Ton ", " ton "),
    @(" Tes ", " tes "),
    @("Tes coûts", "tes coûts"),
    @("Ton projet", "ton projet"),
    @("Ton offre", "ton offre"),
    @("Ton situation", "ta situation"),
    @("Ton adresse", "ton adresse"),
    @("Ton évaluation", "ton évaluation"),
    @("Ton propriété", "ta propriété"),
    @("Ton profil", "ton profil"),
    @("Ton demande", "ta demande"),
    @("Ton message", "ton message"),
    @("Ton financement", "ton financement"),
    @("Ton calendrier", "ton calendrier"),
    @("Ton décision", "ta décision"),
    @("Ton prise", "ta prise"),
    @("Ton hypothèque", "ton hypothèque"),
    @("Ton taux", "ton taux"),
    @("Ton cas", "ton cas"),
    @("Ton maison", "ta maison"),
    @("Ton titre", "ton titre"),
    @("Ton expérience", "ton expérience"),
    @("Ton carrière", "ta carrière"),
    @("en êtes", "en es"),
    @("où vous en êtes", "où tu en es"),
    # Common patterns
    @("vous en êtes", "tu en es"),
    @("êtes-vous", "es-tu"),
    @("Êtes-vous", "Es-tu"),
    @("vous êtes", "tu es"),
    @("Vous êtes", "Tu es"),
    @("vous avez", "tu as"),
    @("Vous avez", "Tu as"),
    @("vous pouvez", "tu peux"),
    @("Vous pouvez", "Tu peux"),
    @("vous devez", "tu dois"),
    @("Vous devez", "Tu dois"),
    @("vous voulez", "tu veux"),
    @("Vous voulez", "Tu veux"),
    @("vous souhaitez", "tu souhaites"),
    @("Vous souhaitez", "Tu souhaites"),
    @("vous savez", "tu sais"),
    @("Vous savez", "Tu sais"),
    @("pour vous", "pour toi"),
    @("Pour vous", "Pour toi"),
    @("chez vous", "chez toi"),
    @("avec vous", "avec toi"),
    @("sans vous", "sans toi")
)

foreach ($replacement in $replacements) {
    $content = $content.Replace($replacement[0], $replacement[1])
}

# Save the file
$content | Set-Content $filePath -Encoding UTF8 -NoNewline

Write-Host "French translation file updated successfully!" -ForegroundColor Green
Write-Host "All formal 'vous' forms have been converted to informal 'tu' forms." -ForegroundColor Green
