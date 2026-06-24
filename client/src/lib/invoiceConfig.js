// ============================================================================
// INVOICE — static business branding, payment details and terms.
// Edit these constants to change what prints on every generated invoice.
// ============================================================================

export const INVOICE_COMPANY = {
  name: 'CIVLILY TZ',
  tin: '128-284-907',
  location: 'Mbezi Goigi, Dar es Salaam',
};

export const INVOICE_PAYMENT = {
  title: 'PAYMENT DETAILS',
  accountName: 'CASMIRY ANTHONY CHUWA',
  lines: [
    ['CRDB Bank (TZS)', '0152305203800'],
    ['NMB Bank (TZS)', '23310028935'],
    ['LIPA Namba (Airtel)', '65 562 884'],
  ],
};

// Terms shown at the bottom of every invoice (the design from The Doctor).
export const INVOICE_TERMS = [
  'Malipo ni cash tu (hakuna mkopo).',
  'Wanunuzi wa jumla (katoni 5+) hupata punguzo maalum.',
  'Bidhaa zisizolipiwa au zisizouzwa lazima zirudishwe ndani ya saa 72.',
  'Mzigo unapatikana 24/7.',
];

export const INVOICE_FOOTER = 'Asante kwa kufanya biashara na Civlily Tz! Karibu tena.';
