import { supabase } from "@/integrations/supabase/client";

// Function to generate a random password
function generateRandomPassword(): string {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// Function to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export const generateDailyPassword = async (): Promise<string> => {
  const today = getTodayDate();
  
  try {
    // Try to get today's password from the database
    const { data: existingPassword, error: selectError } = await supabase
      .from('signup_passwords')
      .select('password')
      .eq('date', today)
      .single();

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error checking existing password:', selectError);
      throw selectError;
    }

    // If we already have a password for today, return it
    if (existingPassword?.password) {
      return existingPassword.password;
    }

    // Generate a new password for today
    const newPassword = generateRandomPassword();

    // Store the new password
    const { error: insertError } = await supabase
      .from('signup_passwords')
      .insert([
        {
          date: today,
          password: newPassword,
        }
      ]);

    if (insertError) {
      console.error('Error storing password:', insertError);
      throw new Error(insertError.message);
    }

    return newPassword;
  } catch (error) {
    console.error('Error in generateDailyPassword:', error);
    throw error;
  }
};

export const verifyRotatingPassword = async (inputPassword: string): Promise<boolean> => {
  const today = getTodayDate();
  
  try {
    // Get today's password from the database
    const { data: passwordData, error } = await supabase
      .from('signup_passwords')
      .select('password')
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error verifying password:', error);
      throw error;
    }

    if (!passwordData?.password) {
      // If no password exists for today, generate one
      const currentPassword = await generateDailyPassword();
      return inputPassword === currentPassword;
    }

    return inputPassword === passwordData.password;
  } catch (error) {
    console.error('Error in verifyRotatingPassword:', error);
    throw error;
  }
}; 