import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://asijabjhlrosdbnsqkfk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzaWphYmpobHJvc2RibnNxa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzU0MDIsImV4cCI6MjA4OTE1MTQwMn0.0W8fDeyojvT4VZtzhMchwUKYQdmTR2RvMjJE8w22lPw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  project_name: string;
  company_info: any;
  devis_config: any;
  settings: any;
  updated_at: string;
};

export type ProjectItem = {
  id: string;
  user_id: string;
  type: 'profile' | 'plate';
  label: string;
  mark: string;
  profile_id: string | null;
  custom_profile_name: string | null;
  custom_linear_mass: number | null;
  length: number;
  width: number | null;
  thickness: number | null;
  quantity: number;
  created_at: string;
};
