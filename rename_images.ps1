# Image Renaming Script for HYPOTEQ
# This script renames all images to follow the pattern: HYPOTEQ_pagename_description

$imagesPath = "c:\Users\Lenovo\Desktop\Hypoteqfunnel-main\public\images"
cd $imagesPath

# Define the renaming map based on page usage
$renameMap = @{
    # HOME PAGE (Hero Section)
    "fotoHeroSection.png" = "HYPOTEQ_home_hero_banner.png"
    "Hero1.jpg" = "HYPOTEQ_home_hero_alt.jpg"
    "Home_Page_Hero_banner.png" = "HYPOTEQ_home_hero_main.png"
    "photohero.png" = "HYPOTEQ_home_hero_small.png"
    "mobilehome.png" = "HYPOTEQ_home_mobile_view.png"
    
    # HOME PAGE (Bank Logos - Hero Section)
    "UBS-LogoBlack.svg" = "HYPOTEQ_home_bank_ubs.svg"
    "24.png" = "HYPOTEQ_home_bank_zkb.png"
    "Bank_Cler_logo.png" = "HYPOTEQ_home_bank_cler.png"
    "Raiffeisen_Schweiz_Logo.png" = "HYPOTEQ_home_bank_raiffeisen.png"
    "67.svg" = "HYPOTEQ_home_bank_postfinance.svg"
    "snb.svg" = "HYPOTEQ_home_bank_snb.svg"
    
    # HOME PAGE (Benefits Section)
    "benefits1.png" = "HYPOTEQ_home_benefits_main.png"
    
    # HOME PAGE (How It Works Section)
    "Epara.png" = "HYPOTEQ_home_howitworks_step1.png"
    "documents.png" = "HYPOTEQ_home_howitworks_step2.png"
    "486373494.png" = "HYPOTEQ_home_howitworks_step3.png"
    
    # HOME PAGE (Testimonials)
    "testimonial-1.svg" = "HYPOTEQ_home_testimonial_1.svg"
    "testimonial-2.svg" = "HYPOTEQ_home_testimonial_2.svg"
    "testimonial.-3.svg" = "HYPOTEQ_home_testimonial_3.svg"
    
    # HOME PAGE (CTA Banners)
    "cta1.png" = "HYPOTEQ_home_cta_banner.png"
    "mg-mobile.png" = "HYPOTEQ_home_cta_mobile.png"
    "FOto6.png" = "HYPOTEQ_home_cta_desktop.png"
    "foto12345.png" = "HYPOTEQ_home_mortgage_guide.png"
    
    # ABOUT PAGE
    "about-home.png" = "HYPOTEQ_about_hero.png"
    "8329269237.png" = "HYPOTEQ_about_main_image.png"
    "2586.png" = "HYPOTEQ_about_stats_visual.png"
    "mission.svg" = "HYPOTEQ_about_mission_icon.svg"
    "32.svg" = "HYPOTEQ_about_vision_icon.svg"
    "Values.svg" = "HYPOTEQ_about_values_icon.svg"
    "Group.svg" = "HYPOTEQ_about_team_icon.svg"
    "Group 168.svg" = "HYPOTEQ_about_group_icon.svg"
    
    # ABOUT PAGE (Team Section)
    "Marco.png" = "HYPOTEQ_about_team_marco.png"
    "MarcoP.png" = "HYPOTEQ_about_team_marco_alt.png"
    "Davide.png" = "HYPOTEQ_about_team_davide.png"
    "Fisnik.png" = "HYPOTEQ_about_team_fisnik.png"
    "Alexander.png" = "HYPOTEQ_about_team_alexander.png"
    "Claudio.png" = "HYPOTEQ_about_team_claudio.png"
    "Christian.png" = "HYPOTEQ_about_team_christian.png"
    "ChrsitianW.png" = "HYPOTEQ_about_team_christianw.png"
    "Cyril.png" = "HYPOTEQ_about_team_cyril.png"
    "Markus.png" = "HYPOTEQ_about_team_markus.png"
    "linkedin.svg" = "HYPOTEQ_about_social_linkedin.svg"
    "email.svg" = "HYPOTEQ_about_social_email.svg"
    
    # ADVANTAGES PAGE
    "2026.png" = "HYPOTEQ_advantages_benefit_main.png"
    "Foto2.png" = "HYPOTEQ_advantages_visual_2.png"
    "Foto3.png" = "HYPOTEQ_advantages_visual_3.png"
    "Foto4.png" = "HYPOTEQ_advantages_visual_4.png"
    
    # ADVISORY PAGE
    "09.png" = "HYPOTEQ_advisory_main_visual.png"
    
    # CALCULATOR PAGE
    "123.png" = "HYPOTEQ_calc_calculator_icon.png"
    "00.jpg" = "HYPOTEQ_calc_house_background.jpg"
    "0102.png" = "HYPOTEQ_calc_background_alt.png"
    
    # CONTACT PAGE
    "Calendar2.png" = "HYPOTEQ_contact_calendar.png"
    "kalendly.png" = "HYPOTEQ_contact_calendly.png"
    
    # DOCUMENTS PAGE
    "documents.svg" = "HYPOTEQ_documents_icon.svg"
    "german.png" = "HYPOTEQ_documents_flag_german.png"
    "france.png" = "HYPOTEQ_documents_flag_french.png"
    "it.png" = "HYPOTEQ_documents_flag_italian.png"
    "united-kingdom.png" = "HYPOTEQ_documents_flag_english.png"
    "switzerland.png" = "HYPOTEQ_documents_flag_swiss.png"
    "flags.png" = "HYPOTEQ_documents_flags_combined.png"
    
    # FUNNEL PAGE
    "44.svg" = "HYPOTEQ_funnel_natural_person_icon.svg"
    "2345.svg" = "HYPOTEQ_funnel_legal_entity_icon.svg"
    "88  (1).svg" = "HYPOTEQ_funnel_project_type1.svg"
    "88  (2).svg" = "HYPOTEQ_funnel_project_type2.svg"
    "nein1.svg" = "HYPOTEQ_funnel_negative_icon.svg"
    "upload.svg" = "HYPOTEQ_funnel_upload_icon.svg"
    
    # HOME EVALUATION PAGE
    "999.png" = "HYPOTEQ_evaluation_mobile_bg.png"
    "vV_.png" = "HYPOTEQ_evaluation_desktop_bg.png"
    "Lokacion.svg" = "HYPOTEQ_evaluation_location_icon.svg"
    "Shpia.svg" = "HYPOTEQ_evaluation_property_icon.svg"
    "ShpiPare.svg" = "HYPOTEQ_evaluation_comparison_icon.svg"
    "Faktura.svg" = "HYPOTEQ_evaluation_invoice_icon.svg"
    
    # HYPOTHEKEN PAGE
    "hypotheneHome.png" = "HYPOTEQ_hypotheken_hero.png"
    "doraqelsi.png" = "HYPOTEQ_hypotheken_feature1.png"
    "2023.png" = "HYPOTEQ_hypotheken_feature2.png"
    "2020.png" = "HYPOTEQ_hypotheken_feature3.png"
    "002.svg" = "HYPOTEQ_hypotheken_zins_icon.svg"
    "Neubau.png" = "HYPOTEQ_hypotheken_new_construction.png"
    "NewMortgage.png" = "HYPOTEQ_hypotheken_new_mortgage.png"
    "Refinance.png" = "HYPOTEQ_hypotheken_refinance.png"
    
    # MEZZANINE PAGE
    "FOtototo.png" = "HYPOTEQ_mezzanine_hero.png"
    "109.png" = "HYPOTEQ_mezzanine_what_is.png"
    "Kalendar.png" = "HYPOTEQ_mezzanine_calendar.png"
    "7777.png" = "HYPOTEQ_mezzanine_risk_timeline.png"
    "58965552.png" = "HYPOTEQ_mezzanine_features_graph.png"
    
    # PARTNER PAGE
    "98.png" = "HYPOTEQ_partner_main_visual.png"
    "MMMA.svg" = "HYPOTEQ_partner_benefit_icon.svg"
    "partner11.svg" = "HYPOTEQ_partner_icon_1.svg"
    "partner22.svg" = "HYPOTEQ_partner_icon_2.svg"
    "partner33.svg" = "HYPOTEQ_partner_icon_3.svg"
    "partner44.svg" = "HYPOTEQ_partner_icon_4.svg"
    
    # LAYOUT (Header & Footer)
    "logo.png" = "HYPOTEQ_layout_logo.png"
    "whitelogo.png" = "HYPOTEQ_layout_logo_white.png"
    
    # MISCELLANEOUS / UNCLEAR USAGE
    "2.jpg" = "HYPOTEQ_misc_image_2.jpg"
    "F1.jpg" = "HYPOTEQ_misc_image_f1.jpg"
    "F2.png" = "HYPOTEQ_misc_image_f2.png"
    "F3.png" = "HYPOTEQ_misc_image_f3.png"
    "h1.png" = "HYPOTEQ_misc_image_h1.png"
    "houses.png" = "HYPOTEQ_misc_houses.png"
    "ijiji.png" = "HYPOTEQ_misc_ijiji.png"
    "oooo.png" = "HYPOTEQ_misc_oooo.png"
    "sda.png" = "HYPOTEQ_misc_sda.png"
    "098.png" = "HYPOTEQ_misc_098.png"
    "123321.png" = "HYPOTEQ_misc_123321.png"
    "556.png" = "HYPOTEQ_misc_556.png"
    "9999.png" = "HYPOTEQ_misc_9999.png"
    "43.svg" = "HYPOTEQ_misc_icon_43.svg"
    "s1.png" = "HYPOTEQ_misc_s1.png"
    "s2.png" = "HYPOTEQ_misc_s2.png"
    "s3.png" = "HYPOTEQ_misc_s3.png"
    "s9.png" = "HYPOTEQ_misc_s9.png"
}

# Perform the renaming
Write-Host "Starting image renaming process..." -ForegroundColor Green
Write-Host "Total files to rename: $($renameMap.Count)" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failCount = 0
$skippedCount = 0

foreach ($oldName in $renameMap.Keys) {
    $newName = $renameMap[$oldName]
    $oldPath = Join-Path $imagesPath $oldName
    $newPath = Join-Path $imagesPath $newName
    
    if (Test-Path $oldPath) {
        if (Test-Path $newPath) {
            Write-Host "SKIPPED: $newName already exists" -ForegroundColor Yellow
            $skippedCount++
        } else {
            try {
                Rename-Item -Path $oldPath -NewName $newName -ErrorAction Stop
                Write-Host "SUCCESS: Renamed $oldName to $newName" -ForegroundColor Green
                $successCount++
            } catch {
                Write-Host "FAILED: $oldName - $($_.Exception.Message)" -ForegroundColor Red
                $failCount++
            }
        }
    } else {
        Write-Host "NOT FOUND: $oldName" -ForegroundColor DarkYellow
        $failCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Renaming Complete!" -ForegroundColor Green
Write-Host "Successfully renamed: $successCount" -ForegroundColor Green
Write-Host "Failed/Not found: $failCount" -ForegroundColor Red
Write-Host "Skipped (already exists): $skippedCount" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
