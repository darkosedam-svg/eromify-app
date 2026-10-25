// Test script to verify OAuth callback is working on production
// Run this in the browser console on https://www.eromify.com

console.log('🧪 Testing OAuth callback on production domain...');

// Test 1: Check if OAuthCallbackHandler route exists
fetch('/oauth-callback')
  .then(response => {
    console.log('✅ OAuth callback route accessible:', response.status);
    return response.text();
  })
  .then(html => {
    if (html.includes('Processing Google OAuth')) {
      console.log('✅ OAuthCallbackHandler component is working!');
    } else {
      console.log('⚠️ OAuthCallbackHandler might not be deployed yet');
    }
  })
  .catch(error => {
    console.log('❌ OAuth callback route not accessible:', error);
  });

// Test 2: Check if the built files include OAuth components
fetch('/assets/')
  .then(response => response.text())
  .then(html => {
    if (html.includes('index-')) {
      console.log('✅ Built assets are accessible');
    }
  })
  .catch(error => {
    console.log('⚠️ Built assets might not be deployed:', error);
  });

// Test 3: Simulate OAuth callback with a test token
const testToken = '<PASTE_A_FRESH_TOKEN_HERE>';

console.log('🧪 To test OAuth callback manually:');
console.log('1. Go to: https://www.eromify.com/oauth-callback');
console.log('2. Or run this in console:');
console.log(`   localStorage.setItem('oauth_token', '${testToken}');`);
console.log('   localStorage.setItem("oauth_source", "production");');
console.log('   window.location.href = "/oauth-callback";');

console.log('🎯 OAuth fix deployment test complete!');



