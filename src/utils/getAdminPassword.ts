import { generateDailyPassword } from './rotatingPassword';

async function showTodayPassword() {
    const password = await generateDailyPassword();
    console.log('Today\'s signup password:', password);
    console.log('This password will reset at midnight UTC');
}

// Run the function
showTodayPassword(); 