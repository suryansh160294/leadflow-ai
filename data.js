// =============================================
//  data.js — LeadFlow AI v2 Enhanced Data
// =============================================

// ── App Settings (Admin-Controlled) ─────────
const APP_SETTINGS = {
  distributionMode: 'smart',      // 'smart' | 'round-robin'
  allowDuplicates: false,
  autoReassignOnCapacity: false,
  priorityWeights: { temperature: 40, budget: 30, source: 20, property: 10 },
  roundRobinPointers: {}          // keyed by location
};

// ── Sales Executives (10 total) ─────────────
const EXECUTIVES = [
  {
    id: 'exec-1',
    name: 'Priya Sharma',
    phone: '+91 98201 11001',
    email: 'priya.sharma@leadflow.ai',
    active: true,
    locations: ['Bandra', 'Andheri', 'Powai'],
    maxDailyCapacity: 8,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 74,
    expertise: ['Luxury', '3BHK+', 'Resale'],
    joinedDate: '2023-01-15',
    avatarClass: 'av-0'
  },
  {
    id: 'exec-2',
    name: 'Rahul Mehta',
    phone: '+91 98201 11002',
    email: 'rahul.mehta@leadflow.ai',
    active: true,
    locations: ['Thane', 'Navi Mumbai', 'Powai'],
    maxDailyCapacity: 6,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 68,
    expertise: ['Mid-segment', '2BHK', 'New Launch'],
    joinedDate: '2023-03-10',
    avatarClass: 'av-1'
  },
  {
    id: 'exec-3',
    name: 'Sunita Nair',
    phone: '+91 98201 11003',
    email: 'sunita.nair@leadflow.ai',
    active: true,
    locations: ['Pune', 'Bandra'],
    maxDailyCapacity: 5,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 81,
    expertise: ['Premium', 'Villa', 'Penthouse'],
    joinedDate: '2022-11-20',
    avatarClass: 'av-2'
  },
  {
    id: 'exec-4',
    name: 'Arjun Kapoor',
    phone: '+91 98201 11004',
    email: 'arjun.kapoor@leadflow.ai',
    active: true,
    locations: ['Whitefield', 'Electronic City', 'HSR Layout'],
    maxDailyCapacity: 7,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 65,
    expertise: ['IT Corridor', 'Affordable', '1BHK'],
    joinedDate: '2023-06-01',
    avatarClass: 'av-3'
  },
  {
    id: 'exec-5',
    name: 'Deepika Rao',
    phone: '+91 98201 11005',
    email: 'deepika.rao@leadflow.ai',
    active: false,           // ← INACTIVE
    locations: ['Gurgaon', 'Bandra', 'Andheri'],
    maxDailyCapacity: 6,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 70,
    expertise: ['Corporate', 'NRI Clients'],
    joinedDate: '2022-08-05',
    avatarClass: 'av-4'
  },
  {
    id: 'exec-6',
    name: 'Vikram Singh',
    phone: '+91 98201 11006',
    email: 'vikram.singh@leadflow.ai',
    active: true,
    locations: ['Gurgaon', 'Andheri'],
    maxDailyCapacity: 4,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 59,
    expertise: ['Commercial', 'Plots'],
    joinedDate: '2023-09-12',
    avatarClass: 'av-5'
  },
  {
    id: 'exec-7',
    name: 'Meera Pillai',
    phone: '+91 98201 11007',
    email: 'meera.pillai@leadflow.ai',
    active: true,
    locations: ['Powai', 'Thane', 'Navi Mumbai', 'Pune'],
    maxDailyCapacity: 9,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 77,
    expertise: ['Family Homes', '3BHK', 'Integrated Townships'],
    joinedDate: '2022-06-30',
    avatarClass: 'av-6'
  },
  {
    id: 'exec-8',
    name: 'Aditya Joshi',
    phone: '+91 98201 11008',
    email: 'aditya.joshi@leadflow.ai',
    active: true,
    locations: ['HSR Layout', 'Electronic City', 'Whitefield', 'Gurgaon'],
    maxDailyCapacity: 6,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 63,
    expertise: ['Tech Parks', 'Startup Corridor', '2BHK'],
    joinedDate: '2023-07-18',
    avatarClass: 'av-7'
  },
  {
    id: 'exec-9',
    name: 'Kavya Reddy',
    phone: '+91 98201 11009',
    email: 'kavya.reddy@leadflow.ai',
    active: true,
    locations: ['Bandra', 'Pune', 'HSR Layout'],
    maxDailyCapacity: 7,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 85,
    expertise: ['Luxury', '4BHK+', 'Penthouse', 'NRI'],
    joinedDate: '2022-03-01',
    avatarClass: 'av-8'
  },
  {
    id: 'exec-10',
    name: 'Sandeep Kulkarni',
    phone: '+91 98201 11010',
    email: 'sandeep.k@leadflow.ai',
    active: true,
    locations: ['Andheri', 'Thane', 'Navi Mumbai'],
    maxDailyCapacity: 8,
    currentLeads: 0,
    totalAllTime: 0,
    successRate: 71,
    expertise: ['First-time Buyers', 'Affordable', '1BHK', '2BHK'],
    joinedDate: '2023-04-22',
    avatarClass: 'av-9'
  }
];

// ── Seed Leads (22 leads, varied for testing) ─
const SEED_LEADS = [
  {
    name: 'Ananya Krishnan',
    phone: '+91 99001 00101',
    source: '99acres',
    location: 'Bandra',
    budget: '₹1Cr–₹2Cr',
    propertyType: '3BHK Apartment',
    temperature: 'hot'
  },
  {
    name: 'Suresh Patel',
    phone: '+91 99001 00102',
    source: 'MagicBricks',
    location: 'Thane',
    budget: '₹60L–₹1Cr',
    propertyType: '2BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Rekha Iyer',
    phone: '+91 99001 00103',
    source: 'Google Ads',
    location: 'Whitefield',
    budget: '> ₹2Cr',
    propertyType: 'Villa',
    temperature: 'hot'
  },
  {
    name: 'Manish Gupta',
    phone: '+91 99001 00104',
    source: 'Facebook Ads',
    location: 'Powai',
    budget: '₹30L–₹60L',
    propertyType: '1BHK Apartment',
    temperature: 'cold'
  },
  {
    name: 'Lakshmi Reddy',
    phone: '+91 99001 00105',
    source: 'Referral',
    location: 'Gurgaon',
    budget: '₹1Cr–₹2Cr',
    propertyType: '3BHK Apartment',
    temperature: 'hot'
  },
  {
    name: 'Karthik Subramanian',
    phone: '+91 99001 00106',
    source: 'Housing.com',
    location: 'HSR Layout',
    budget: '₹60L–₹1Cr',
    propertyType: '2BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Pooja Malhotra',
    phone: '+91 99001 00107',
    source: 'Instagram',
    location: 'Andheri',
    budget: '< ₹30L',
    propertyType: '1BHK Apartment',
    temperature: 'cold'
  },
  {
    name: 'Nikhil Bose',
    phone: '+91 99001 00108',
    source: 'NoBroker',
    location: 'Electronic City',
    budget: '₹30L–₹60L',
    propertyType: '2BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Divya Nambiar',
    phone: '+91 99001 00109',
    source: 'Walk-in',
    location: 'Pune',
    budget: '> ₹2Cr',
    propertyType: 'Penthouse',
    temperature: 'hot'
  },
  {
    name: 'Rohit Saxena',
    phone: '+91 99001 00110',
    source: '99acres',
    location: 'Navi Mumbai',
    budget: '₹60L–₹1Cr',
    propertyType: '3BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Nisha Agarwal',
    phone: '+91 99001 00111',
    source: 'MagicBricks',
    location: 'Bandra',
    budget: '> ₹2Cr',
    propertyType: '4BHK+ Apartment',
    temperature: 'hot'
  },
  {
    name: 'Sanjay Verma',
    phone: '+91 99001 00112',
    source: 'Facebook Ads',
    location: 'Gurgaon',
    budget: '₹1Cr–₹2Cr',
    propertyType: 'Villa',
    temperature: 'warm'
  },
  {
    name: 'Kavitha Menon',
    phone: '+91 99001 00113',
    source: 'Google Ads',
    location: 'Andheri',
    budget: '₹30L–₹60L',
    propertyType: '2BHK Apartment',
    temperature: 'cold'
  },
  {
    name: 'Ashwin Tiwari',
    phone: '+91 99001 00114',
    source: 'Referral',
    location: 'Powai',
    budget: '₹60L–₹1Cr',
    propertyType: '3BHK Apartment',
    temperature: 'hot'
  },
  {
    name: 'Geeta Chandra',
    phone: '+91 99001 00115',
    source: 'Housing.com',
    location: 'Pune',
    budget: '< ₹30L',
    propertyType: '1BHK Apartment',
    temperature: 'cold'
  },
  {
    name: 'Farhan Sheikh',
    phone: '+91 99001 00116',
    source: 'Instagram',
    location: 'Thane',
    budget: '> ₹2Cr',
    propertyType: 'Commercial',
    temperature: 'hot'
  },
  {
    name: 'Riya Desai',
    phone: '+91 99001 00117',
    source: 'Referral',
    location: 'Bandra',
    budget: '> ₹2Cr',
    propertyType: 'Penthouse',
    temperature: 'hot'
  },
  {
    name: 'Mohit Bansal',
    phone: '+91 99001 00118',
    source: 'NoBroker',
    location: 'HSR Layout',
    budget: '₹30L–₹60L',
    propertyType: '1BHK Apartment',
    temperature: 'cold'
  },
  {
    name: 'Sneha Iyer',
    phone: '+91 99001 00119',
    source: 'Walk-in',
    location: 'Electronic City',
    budget: '₹60L–₹1Cr',
    propertyType: '2BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Tarun Mishra',
    phone: '+91 99001 00120',
    source: '99acres',
    location: 'Gurgaon',
    budget: '₹1Cr–₹2Cr',
    propertyType: '3BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Preethi Nair',
    phone: '+91 99001 00121',
    source: 'MagicBricks',
    location: 'Whitefield',
    budget: '₹60L–₹1Cr',
    propertyType: '2BHK Apartment',
    temperature: 'warm'
  },
  {
    name: 'Abhishek Roy',
    phone: '+91 99001 00122',
    source: 'Google Ads',
    location: 'Navi Mumbai',
    budget: '< ₹30L',
    propertyType: '1BHK Apartment',
    temperature: 'cold'
  }
];

// ── Simulated daily trend data (last 14 days) ─
const DAILY_TREND = [4, 7, 5, 9, 12, 8, 11, 15, 10, 14, 18, 13, 16, 22];
