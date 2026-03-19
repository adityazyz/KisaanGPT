'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Lang = 'en' | 'hi';

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATIONS
// ─────────────────────────────────────────────────────────────────────────────
const translations = {
  en: {
    // ── App ──────────────────────────────────────────────────────────────────
    app_name: 'AgriConnect',
    app_tagline: 'Farmer Portal',

    // ── Nav ──────────────────────────────────────────────────────────────────
    nav_dashboard:      'Dashboard',
    nav_farms:          'My Farms',
    nav_crop_plans:     'Crop Plans',
    nav_production:     'Production',
    nav_supply:         'My Supply',
    nav_crop_ai:        'Crop AI',
    nav_inputs:         'Input Market',
    nav_notifications:  'Notifications',
    nav_my_account:     'My Account',

    // ── Dashboard ────────────────────────────────────────────────────────────
    dashboard_welcome:      'Welcome back 👋',
    dashboard_subtitle:     "Here's an overview of your farm operations.",
    dashboard_my_farms:     'My Farms',
    dashboard_active_plans: 'Active Plans',
    dashboard_total_yield:  'Total Yield (kg)',
    dashboard_pending_supply: 'Pending Supply',
    dashboard_quick_actions: 'Quick Actions',
    dashboard_season_calendar: 'Season Calendar',
    dashboard_current:      'Current',
    action_add_farm:        '➕ Add a new farm',
    action_create_plan:     '📋 Create a crop plan',
    action_log_harvest:     '📦 Log production record',
    action_submit_supply:   '🚜 Submit produce to supply',
    action_browse_inputs:   '🧪 Browse input marketplace',
    season_kharif:          'Kharif',
    season_kharif_months:   'Jun – Sep',
    season_kharif_crops:    'Rice, Maize, Cotton, Soybean',
    season_rabi:            'Rabi',
    season_rabi_months:     'Oct – Mar',
    season_rabi_crops:      'Wheat, Mustard, Chickpea',
    season_zaid:            'Zaid',
    season_zaid_months:     'Mar – May',
    season_zaid_crops:      'Watermelon, Cucumber',

    // ── Farms ────────────────────────────────────────────────────────────────
    farms_title:            'My Farms',
    farms_subtitle:         'Manage your farm plots and land details',
    farms_add:              '+ Add Farm',
    farms_add_first:        'Add Your First Farm',
    farms_empty_title:      'No farms yet',
    farms_empty_desc:       'Add your first farm to start generating crop plans.',
    farms_form_title:       'Add New Farm',
    farms_name:             'Farm Name',
    farms_name_placeholder: 'e.g. North Field',
    farms_location:         'Location / Village',
    farms_location_placeholder: 'Village / Town name',
    farms_state:            'State',
    farms_select_state:     'Select state',
    farms_district:         'District',
    farms_area:             'Area (acres)',
    farms_soil:             'Soil Type',
    farms_select_soil:      'Select soil',
    farms_irrigation:       'Irrigation',
    farms_select_irrigation:'Select type',
    farms_latitude:         'Latitude (optional)',
    farms_longitude:        'Longitude (optional)',
    farms_view_plans:       'View Plans',
    farms_crop_suggestions: 'Crop Suggestions',
    farms_plans:            'plans',

    // ── Crop Plans ───────────────────────────────────────────────────────────
    plans_title:            'Crop Plans',
    plans_subtitle:         'AI-generated plans based on your farm data, weather & market demand',
    plans_generate:         '✨ Generate AI Plan',
    plans_generating:       'Generating…',
    plans_generating_msg:   'Analyzing soil, weather, season & market demand for',
    plans_empty_title:      'No crop plans yet',
    plans_empty_desc:       'Add a farm first, then generate an AI plan.',
    plans_add_farm:         'Add a Farm',
    plans_without_active:   'Generate AI Plan for Your Farms',
    plans_why:              '🤖 Why this crop?',
    plans_market_demand:    'Market demand:',
    plans_weather_alerts:   '⚠️ Weather Alerts',
    plans_timeline:         'Timeline',
    plans_inputs:           'Inputs',
    plans_risks:            'Risks',
    plans_refresh_weather:  '🌤 Refresh Weather',
    plans_cancel:           'Cancel',
    plans_no_risks:         'No risks identified.',
    plans_no_inputs:        'No input recommendations.',
    plans_sow:              'Sow:',
    plans_harvest:          'Harvest:',
    plans_acres:            'acres',
    plans_failed:           'Failed to generate plan. Check backend logs.',

    // ── Production ───────────────────────────────────────────────────────────
    prod_title:             'Production Records',
    prod_subtitle:          'Log your actual harvest yields',
    prod_log:               '+ Log Harvest',
    prod_empty_title:       'No production records',
    prod_empty_desc:        'Start logging your harvests to track performance.',
    prod_log_first:         'Log First Harvest',
    prod_actual:            'Actual (kg)',
    prod_estimated:         'Estimated (kg)',
    prod_harvested:         '🗓 Harvested:',
    prod_submit_supply:     '🚜 Submit to Supply Aggregation',
    prod_submitting:        'Submitting…',
    prod_submit_confirm:    'Submit this production to supply aggregation?',
    prod_submit_success:    'Submitted! Admin will verify shortly.',
    prod_form_title:        'Log Harvest',
    prod_farm:              'Farm',
    prod_select_farm:       'Select farm',
    prod_linked_plan:       'Linked Crop Plan (optional)',
    prod_none:              'None',
    prod_crop_name:         'Crop Name',
    prod_crop_placeholder:  'e.g. Wheat',
    prod_actual_yield:      'Actual Yield (kg)',
    prod_system_estimate:   'System Estimate (kg)',
    prod_harvest_date:      'Harvest Date',
    prod_quality:           'Quality Grade',
    prod_notes:             'Notes',
    prod_save:              'Log Harvest',
    prod_saving:            'Saving…',
    grade_A:                'Grade A',
    grade_B:                'Grade B',
    grade_C:                'Grade C',
    grade_ungraded:         'Ungraded',

    // ── Supply ───────────────────────────────────────────────────────────────
    supply_title:           'My Supply',
    supply_subtitle:        'Track your produce submitted for aggregation and sale',
    supply_how_title:       'How Supply Aggregation Works',
    supply_step1:           'Log your harvest in Production Records',
    supply_step2:           'Submit it to supply — it appears as "Pending"',
    supply_step3:           'Admin verifies and grades your produce',
    supply_step4:           'Your supply is grouped with nearby farmers by crop',
    supply_step5:           'Admin matches your lot with buyers',
    supply_empty_title:     'No supply items yet',
    supply_empty_desc:      'Go to Production Records and submit a harvest to supply.',
    supply_lot:             '📍 Lot:',
    supply_kg:              'kg · Grade',
    status_pending:         'Pending',
    status_verified:        'Verified',
    status_aggregated:      'Aggregated',
    status_matched:         'Matched',
    status_sold:            'Sold',

    // ── Inputs ───────────────────────────────────────────────────────────────
    inputs_title:           'Input Marketplace',
    inputs_subtitle:        'Browse seeds, fertilizers, pesticides and more',
    inputs_all:             'All',
    inputs_empty:           'No products found in this category.',
    inputs_for:             '✅ For:',
    inputs_contact:         'Contact',
    inputs_contact_title:   'Contact Supplier',
    inputs_qty_needed:      'Quantity Needed (optional)',
    inputs_message:         'Message',
    inputs_message_placeholder: 'Describe your requirement…',
    inputs_send:            'Send Enquiry',
    inputs_sending:         'Sending…',
    inputs_sent_title:      '✅ Lead Sent!',
    inputs_sent_desc:       'The supplier will contact you soon.',
    inputs_cancel:          'Cancel',

    // ── Notifications ────────────────────────────────────────────────────────
    notif_title:            'Notifications',
    notif_empty:            'No notifications yet.',

    // ── Crop Analysis ────────────────────────────────────────────────────────
    ai_title:               'Crop AI Scanner',
    ai_subtitle:            'Upload a video or photo — watch real-time AI scan each frame',
    ai_disease:             'Disease Detection',
    ai_disease_desc:        'Identify diseases, pests & deficiencies with remedies',
    ai_grade:               'Quality Grading',
    ai_grade_desc:          'Grade your crop and get market price estimates',
    ai_upload_title:        'Upload Video or Image',
    ai_upload_desc:         'MP4, MOV, AVI · JPG, PNG · Max 50MB',
    ai_start_disease:       '🔬 Start Disease Scan',
    ai_start_grade:         '🏅 Start Quality Scan',
    ai_change_file:         'Change File',
    ai_new_scan:            'New Scan',
    ai_view_report:         'View Full Report →',
    ai_live_obs:            'Live Observations',
    ai_frames:              'frames',

    // ── Common ───────────────────────────────────────────────────────────────
    cancel:                 'Cancel',
    save:                   'Save',
    saving:                 'Saving…',
    add:                    'Add',
    edit:                   'Edit',
    delete:                 'Delete',
    confirm:                'Confirm',
    back:                   '← Back',
    loading:                'Loading…',
    new_analysis:           '← New Analysis',
    remove:                 'Remove',
    badge_ai:               'AI',
  },

  hi: {
    // ── App ──────────────────────────────────────────────────────────────────
    app_name: 'एग्रीकनेक्ट',
    app_tagline: 'किसान पोर्टल',

    // ── Nav ──────────────────────────────────────────────────────────────────
    nav_dashboard:      'डैशबोर्ड',
    nav_farms:          'मेरे खेत',
    nav_crop_plans:     'फसल योजना',
    nav_production:     'उत्पादन',
    nav_supply:         'मेरी आपूर्ति',
    nav_crop_ai:        'फसल AI',
    nav_inputs:         'इनपुट बाजार',
    nav_notifications:  'सूचनाएं',
    nav_my_account:     'मेरा खाता',

    // ── Dashboard ────────────────────────────────────────────────────────────
    dashboard_welcome:      'वापस स्वागत है 👋',
    dashboard_subtitle:     'आपके खेत के कार्यों का अवलोकन यहां है।',
    dashboard_my_farms:     'मेरे खेत',
    dashboard_active_plans: 'सक्रिय योजनाएं',
    dashboard_total_yield:  'कुल उपज (किग्रा)',
    dashboard_pending_supply: 'लंबित आपूर्ति',
    dashboard_quick_actions: 'त्वरित कार्य',
    dashboard_season_calendar: 'मौसम कैलेंडर',
    dashboard_current:      'चालू',
    action_add_farm:        '➕ नया खेत जोड़ें',
    action_create_plan:     '📋 फसल योजना बनाएं',
    action_log_harvest:     '📦 उत्पादन रिकॉर्ड करें',
    action_submit_supply:   '🚜 आपूर्ति में जमा करें',
    action_browse_inputs:   '🧪 इनपुट बाजार देखें',
    season_kharif:          'खरीफ',
    season_kharif_months:   'जून – सितंबर',
    season_kharif_crops:    'धान, मक्का, कपास, सोयाबीन',
    season_rabi:            'रबी',
    season_rabi_months:     'अक्टूबर – मार्च',
    season_rabi_crops:      'गेहूं, सरसों, चना',
    season_zaid:            'जायद',
    season_zaid_months:     'मार्च – मई',
    season_zaid_crops:      'तरबूज, खीरा',

    // ── Farms ────────────────────────────────────────────────────────────────
    farms_title:            'मेरे खेत',
    farms_subtitle:         'अपने खेत और जमीन की जानकारी प्रबंधित करें',
    farms_add:              '+ खेत जोड़ें',
    farms_add_first:        'पहला खेत जोड़ें',
    farms_empty_title:      'अभी कोई खेत नहीं',
    farms_empty_desc:       'फसल योजना बनाने के लिए पहला खेत जोड़ें।',
    farms_form_title:       'नया खेत जोड़ें',
    farms_name:             'खेत का नाम',
    farms_name_placeholder: 'जैसे उत्तरी खेत',
    farms_location:         'स्थान / गांव',
    farms_location_placeholder: 'गांव / शहर का नाम',
    farms_state:            'राज्य',
    farms_select_state:     'राज्य चुनें',
    farms_district:         'जिला',
    farms_area:             'क्षेत्र (एकड़)',
    farms_soil:             'मिट्टी का प्रकार',
    farms_select_soil:      'मिट्टी चुनें',
    farms_irrigation:       'सिंचाई',
    farms_select_irrigation:'प्रकार चुनें',
    farms_latitude:         'अक्षांश (वैकल्पिक)',
    farms_longitude:        'देशांतर (वैकल्पिक)',
    farms_view_plans:       'योजनाएं देखें',
    farms_crop_suggestions: 'फसल सुझाव',
    farms_plans:            'योजनाएं',

    // ── Crop Plans ───────────────────────────────────────────────────────────
    plans_title:            'फसल योजनाएं',
    plans_subtitle:         'खेत डेटा, मौसम और बाजार मांग के आधार पर AI योजनाएं',
    plans_generate:         '✨ AI योजना बनाएं',
    plans_generating:       'बन रही है…',
    plans_generating_msg:   'मिट्टी, मौसम और बाजार का विश्लेषण हो रहा है',
    plans_empty_title:      'अभी कोई फसल योजना नहीं',
    plans_empty_desc:       'पहले खेत जोड़ें, फिर AI योजना बनाएं।',
    plans_add_farm:         'खेत जोड़ें',
    plans_without_active:   'अपने खेतों के लिए AI योजना बनाएं',
    plans_why:              '🤖 यह फसल क्यों?',
    plans_market_demand:    'बाजार मांग:',
    plans_weather_alerts:   '⚠️ मौसम चेतावनी',
    plans_timeline:         'समयरेखा',
    plans_inputs:           'इनपुट',
    plans_risks:            'जोखिम',
    plans_refresh_weather:  '🌤 मौसम अपडेट',
    plans_cancel:           'रद्द करें',
    plans_no_risks:         'कोई जोखिम नहीं।',
    plans_no_inputs:        'कोई इनपुट सुझाव नहीं।',
    plans_sow:              'बुवाई:',
    plans_harvest:          'कटाई:',
    plans_acres:            'एकड़',
    plans_failed:           'योजना बनाने में विफल। बैकेंड लॉग देखें।',

    // ── Production ───────────────────────────────────────────────────────────
    prod_title:             'उत्पादन रिकॉर्ड',
    prod_subtitle:          'अपनी वास्तविक फसल उपज दर्ज करें',
    prod_log:               '+ फसल दर्ज करें',
    prod_empty_title:       'कोई उत्पादन रिकॉर्ड नहीं',
    prod_empty_desc:        'प्रदर्शन ट्रैक करने के लिए फसल दर्ज करें।',
    prod_log_first:         'पहली फसल दर्ज करें',
    prod_actual:            'वास्तविक (किग्रा)',
    prod_estimated:         'अनुमानित (किग्रा)',
    prod_harvested:         '🗓 कटाई:',
    prod_submit_supply:     '🚜 आपूर्ति में जमा करें',
    prod_submitting:        'जमा हो रहा है…',
    prod_submit_confirm:    'इस उत्पादन को आपूर्ति में जमा करें?',
    prod_submit_success:    'जमा हो गया! एडमिन जल्द सत्यापित करेगा।',
    prod_form_title:        'फसल दर्ज करें',
    prod_farm:              'खेत',
    prod_select_farm:       'खेत चुनें',
    prod_linked_plan:       'जुड़ी फसल योजना (वैकल्पिक)',
    prod_none:              'कोई नहीं',
    prod_crop_name:         'फसल का नाम',
    prod_crop_placeholder:  'जैसे गेहूं',
    prod_actual_yield:      'वास्तविक उपज (किग्रा)',
    prod_system_estimate:   'सिस्टम अनुमान (किग्रा)',
    prod_harvest_date:      'कटाई की तारीख',
    prod_quality:           'गुणवत्ता श्रेणी',
    prod_notes:             'नोट्स',
    prod_save:              'फसल दर्ज करें',
    prod_saving:            'सहेजा जा रहा है…',
    grade_A:                'श्रेणी A',
    grade_B:                'श्रेणी B',
    grade_C:                'श्रेणी C',
    grade_ungraded:         'अवर्गीकृत',

    // ── Supply ───────────────────────────────────────────────────────────────
    supply_title:           'मेरी आपूर्ति',
    supply_subtitle:        'एकत्रीकरण और बिक्री के लिए जमा उपज ट्रैक करें',
    supply_how_title:       'आपूर्ति एकत्रीकरण कैसे काम करता है',
    supply_step1:           'उत्पादन रिकॉर्ड में फसल दर्ज करें',
    supply_step2:           'आपूर्ति में जमा करें — "लंबित" दिखेगा',
    supply_step3:           'एडमिन आपकी उपज सत्यापित और ग्रेड करेगा',
    supply_step4:           'आपकी आपूर्ति नजदीकी किसानों के साथ समूहीकृत होगी',
    supply_step5:           'एडमिन आपके लॉट को खरीदारों से मिलाएगा',
    supply_empty_title:     'अभी कोई आपूर्ति नहीं',
    supply_empty_desc:      'उत्पादन रिकॉर्ड में जाएं और आपूर्ति में जमा करें।',
    supply_lot:             '📍 लॉट:',
    supply_kg:              'किग्रा · श्रेणी',
    status_pending:         'लंबित',
    status_verified:        'सत्यापित',
    status_aggregated:      'एकत्रित',
    status_matched:         'मिलान',
    status_sold:            'बिक गया',

    // ── Inputs ───────────────────────────────────────────────────────────────
    inputs_title:           'इनपुट बाजार',
    inputs_subtitle:        'बीज, उर्वरक, कीटनाशक और अधिक खोजें',
    inputs_all:             'सभी',
    inputs_empty:           'इस श्रेणी में कोई उत्पाद नहीं मिला।',
    inputs_for:             '✅ के लिए:',
    inputs_contact:         'संपर्क करें',
    inputs_contact_title:   'आपूर्तिकर्ता से संपर्क करें',
    inputs_qty_needed:      'आवश्यक मात्रा (वैकल्पिक)',
    inputs_message:         'संदेश',
    inputs_message_placeholder: 'अपनी जरूरत बताएं…',
    inputs_send:            'पूछताछ भेजें',
    inputs_sending:         'भेजा जा रहा है…',
    inputs_sent_title:      '✅ भेज दिया गया!',
    inputs_sent_desc:       'आपूर्तिकर्ता जल्द संपर्क करेगा।',
    inputs_cancel:          'रद्द करें',

    // ── Notifications ────────────────────────────────────────────────────────
    notif_title:            'सूचनाएं',
    notif_empty:            'अभी कोई सूचना नहीं।',

    // ── Crop Analysis ────────────────────────────────────────────────────────
    ai_title:               'फसल AI स्कैनर',
    ai_subtitle:            'वीडियो या फोटो अपलोड करें — AI हर फ्रेम को रियल-टाइम स्कैन करेगा',
    ai_disease:             'रोग पहचान',
    ai_disease_desc:        'बीमारी, कीट और कमियां पहचानें',
    ai_grade:               'गुणवत्ता ग्रेडिंग',
    ai_grade_desc:          'फसल ग्रेड करें और बाजार मूल्य जानें',
    ai_upload_title:        'वीडियो या फोटो अपलोड करें',
    ai_upload_desc:         'MP4, MOV, AVI · JPG, PNG · अधिकतम 50MB',
    ai_start_disease:       '🔬 रोग स्कैन शुरू करें',
    ai_start_grade:         '🏅 गुणवत्ता स्कैन शुरू करें',
    ai_change_file:         'फ़ाइल बदलें',
    ai_new_scan:            'नया स्कैन',
    ai_view_report:         'पूरी रिपोर्ट देखें →',
    ai_live_obs:            'लाइव अवलोकन',
    ai_frames:              'फ्रेम',

    // ── Common ───────────────────────────────────────────────────────────────
    cancel:                 'रद्द करें',
    save:                   'सहेजें',
    saving:                 'सहेजा जा रहा है…',
    add:                    'जोड़ें',
    edit:                   'संपादित करें',
    delete:                 'हटाएं',
    confirm:                'पुष्टि करें',
    back:                   '← वापस',
    loading:                'लोड हो रहा है…',
    new_analysis:           '← नया विश्लेषण',
    remove:                 'हटाएं',
    badge_ai:               'AI',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
interface LanguageContextType {
  lang:   Lang;
  setLang: (l: Lang) => void;
  t:      (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang:    'en',
  setLang: () => {},
  t:       (key) => translations.en[key] as string,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  // Persist language in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('agri_lang') as Lang | null;
    if (saved === 'en' || saved === 'hi') setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('agri_lang', l);
  };

  const t = (key: TranslationKey): string =>
    (translations[lang][key] as string) ?? (translations.en[key] as string) ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
