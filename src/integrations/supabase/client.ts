
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybykvsrrnkvsrbczhggb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieWt2c3Jybmt2c3JiY3poZ2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzMzg5NjUsImV4cCI6MjA1NTkxNDk2NX0.2tM_K0mbpGtdgb9TG6_-DDaL4vMweT_6khFxLMNT48E';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
