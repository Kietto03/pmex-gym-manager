// Settings for this deployment — see README.md.
// The Supabase anon key is meant to be public: every table is protected by row-level security.
// Leave supabaseUrl / supabaseAnonKey empty to run the built-in demo (sample data, nothing saved).
window.GYM_CONFIG = {
  supabaseUrl: 'https://dmopglllnqeinuclgyhn.supabase.co',          // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb3BnbGxsbnFlaW51Y2xneWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MjUzNjQsImV4cCI6MjEwNjMwMTM2NH0.py8jplqbEwNP62HzpqtbHN-2cRlf5DulzvPG2LKq7bA',      // Project Settings → API → anon public key
  gymName: 'Palletian Folks',   // shown in the header, the tab title and on the sign-in page
  usernameDomain: 'members.pmex-gym.local',   // must match USERNAME_EMAIL_DOMAIN of the admin-users function

  // Where game data comes from (read at runtime, nothing is copied into this repo)
  pomastersUrl: 'https://pomasters.github.io/SyncPairsTracker/',   // sync pairs + icons
  dexUrl: 'https://kietto03.github.io/pmex-supez-dex/',              // data/gyms.json (Gym Battles)
};
