# Google OAuth Fix for Development

## Problem
Google OAuth is redirecting to the production domain `https://www.eromify.com` instead of your local development server `http://localhost:5183`.

## Quick Fix (Manual)

When you get redirected to the production domain with the OAuth token, follow these steps:

### Step 1: Copy the Access Token
From the URL you provided, extract the access token:
```
access_token=<REDACTED_TOKEN>
```

### Step 2: Run This JavaScript in Browser Console
Open the browser console on the production domain and run this code:

```javascript
// Extract token from current URL
const hash = window.location.hash;
const params = new URLSearchParams(hash.substring(1));
const accessToken = params.get('access_token');

if (accessToken) {
  console.log('Found access token:', accessToken.substring(0, 50) + '...');
  
  // Store token and redirect to localhost
  localStorage.setItem('oauth_token', accessToken);
  localStorage.setItem('oauth_source', 'production');
  
  // Redirect to localhost
  window.location.href = 'http://localhost:5183/oauth-callback';
} else {
  console.log('No access token found in URL');
}
```

### Step 3: Automatic Processing
The localhost app will automatically:
1. Detect the stored OAuth token
2. Process it and create a user account
3. Log you in and redirect to the dashboard

## Automated Fix (Already Implemented)

I've also implemented an automated solution:

1. **OAuthCallbackHandler Component**: Handles OAuth tokens from any source
2. **Enhanced AuthContext**: Better OAuth callback processing
3. **Fallback Token Decoding**: If backend fails, it decodes the Supabase token directly

## Test the Fix

1. Try Google OAuth again from `http://localhost:5183/login`
2. When redirected to production domain, run the JavaScript code above
3. You should be redirected back to localhost and logged in automatically

## Permanent Solution

To fix this permanently, you need to update the Supabase OAuth configuration:

1. Go to your Supabase project dashboard
2. Navigate to Authentication > URL Configuration
3. Add `http://localhost:5183` to the redirect URLs
4. Update the site URL to include localhost for development

The current fix works around this by handling the OAuth callback regardless of which domain it comes from.



