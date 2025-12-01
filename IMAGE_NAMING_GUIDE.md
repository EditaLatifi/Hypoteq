# HYPOTEQ Image Naming Convention - Quick Reference

## 📁 Naming Pattern

All images now follow this pattern:
```
HYPOTEQ_[page]_[description].[ext]
```

## 🗂️ Page Prefixes

| Prefix | Page/Section | Example |
|--------|-------------|---------|
| `HYPOTEQ_home_*` | Home page | `HYPOTEQ_home_hero_banner.png` |
| `HYPOTEQ_about_*` | About page | `HYPOTEQ_about_team_marco.png` |
| `HYPOTEQ_advantages_*` | Advantages page | `HYPOTEQ_advantages_benefit_main.png` |
| `HYPOTEQ_advisory_*` | Advisory page | `HYPOTEQ_advisory_main_visual.png` |
| `HYPOTEQ_calc_*` | Calculator page | `HYPOTEQ_calc_calculator_icon.png` |
| `HYPOTEQ_contact_*` | Contact page | `HYPOTEQ_contact_calendar.png` |
| `HYPOTEQ_documents_*` | Documents page | `HYPOTEQ_documents_icon.svg` |
| `HYPOTEQ_funnel_*` | Funnel/Form | `HYPOTEQ_funnel_upload_icon.svg` |
| `HYPOTEQ_evaluation_*` | Home Evaluation | `HYPOTEQ_evaluation_desktop_bg.png` |
| `HYPOTEQ_hypotheken_*` | Hypotheken page | `HYPOTEQ_hypotheken_hero.png` |
| `HYPOTEQ_mezzanine_*` | Mezzanine page | `HYPOTEQ_mezzanine_hero.png` |
| `HYPOTEQ_partner_*` | Partner page | `HYPOTEQ_partner_main_visual.png` |
| `HYPOTEQ_layout_*` | Shared/Layout | `HYPOTEQ_layout_logo.png` |
| `HYPOTEQ_misc_*` | Miscellaneous | `HYPOTEQ_misc_houses.png` |

## 🎯 Common Subcategories

### Bank Logos
```
HYPOTEQ_home_bank_ubs.svg
HYPOTEQ_home_bank_zkb.png
HYPOTEQ_home_bank_cler.png
HYPOTEQ_home_bank_raiffeisen.png
HYPOTEQ_home_bank_postfinance.svg
HYPOTEQ_home_bank_snb.svg
```

### Team Members
```
HYPOTEQ_about_team_[firstname].png
```

### Language Flags
```
HYPOTEQ_documents_flag_german.png
HYPOTEQ_documents_flag_french.png
HYPOTEQ_documents_flag_italian.png
HYPOTEQ_documents_flag_english.png
```

### Social Icons
```
HYPOTEQ_about_social_linkedin.svg
HYPOTEQ_about_social_email.svg
```

## 📋 How to Add New Images

When adding a new image to the project:

1. **Identify the page** where it will be used
2. **Choose descriptive name** that explains the image purpose
3. **Follow the pattern**: `HYPOTEQ_[page]_[description].[ext]`
4. **Use lowercase** for page names, underscores for spaces
5. **Be specific** in description (e.g., `hero_banner` not just `banner`)

### Examples:

❌ Bad: `photo1.png`, `image.jpg`, `new-pic.png`
✅ Good: `HYPOTEQ_home_hero_banner.png`, `HYPOTEQ_about_team_john.png`

## 🔍 Finding Images

To find all images for a specific page:
```powershell
cd public/images
Get-ChildItem -Filter "HYPOTEQ_home_*"
Get-ChildItem -Filter "HYPOTEQ_about_*"
Get-ChildItem -Filter "HYPOTEQ_funnel_*"
```

## 📝 Notes

- All component files have been updated to use the new naming convention
- Total of 110 images successfully renamed
- Missing images are documented in `IMAGE_RENAMING_SUMMARY.md`
- ZIP archive `HomePage_Photos.zip` was not renamed (backup file)
