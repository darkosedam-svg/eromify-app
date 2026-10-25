const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { isRealUserId } = require('../middleware/auth');
require('dotenv').config();

// Use fallback values for development if env vars are not set
const supabaseUrl = process.env.SUPABASE_URL || 'https://eyteuevblxvhjhyeivqh.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dGV1ZXZibHh2aGpoeWVpdnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MzYzNjAsImV4cCI6MjA3NTAxMjM2MH0.aTPGEVfNom78Cm9ZmwbMwyzTJ0KkqUE0uIHjBo-MZUA';

const supabase = createClient(supabaseUrl, supabaseKey);

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().min(2).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Authentication never falls back to a made-up session. Earlier versions
// issued a signed "mock mode" token whenever Supabase returned an error or
// was unreachable, and a wrong password is an error as far as Supabase is
// concerned, so any email and password logged in. Every failure below now
// returns an error and no token.

const isSupabaseConfigured = () =>
  Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_URL !== 'https://your-project.supabase.co' &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_ANON_KEY !== 'your-anon-key'
  );

function jwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  return process.env.JWT_SECRET;
}

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, jwtSecret(), { expiresIn: '7d' });
}

function authUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: 'Authentication is temporarily unavailable. Please try again later.'
  });
}

// Supabase answers a bad email/password with a 400. A 401/403 means our own
// API key was rejected, and 5xx means Supabase itself failed; neither is the
// user's fault, and neither may be treated as a successful login.
function isCallerError(supabaseError) {
  return supabaseError.status >= 400 && supabaseError.status < 500 &&
    supabaseError.status !== 401 && supabaseError.status !== 403;
}

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { email, password, fullName } = value;

    if (!isSupabaseConfigured()) {
      console.error('Registration refused: Supabase is not configured');
      return authUnavailable(res);
    }

    let data;
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });
      if (result.error) {
        console.error('Supabase registration error:', result.error);
        if (isCallerError(result.error)) {
          return res.status(400).json({
            success: false,
            error: result.error.message || 'Registration failed'
          });
        }
        return authUnavailable(res);
      }
      data = result.data;
    } catch (supabaseError) {
      console.error('Supabase connection error:', supabaseError);
      return authUnavailable(res);
    }

    if (!data || !data.user) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create user'
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to confirm your account.',
      token: signToken(data.user),
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: fullName,
        emailConfirmed: data.user.email_confirmed_at ? true : false
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { email, password } = value;

    if (!isSupabaseConfigured()) {
      console.error('Login refused: Supabase is not configured');
      return authUnavailable(res);
    }

    let data;
    try {
      const result = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (result.error) {
        console.error('Supabase login error:', result.error.status, result.error.code, result.error.message);
        if (result.error.code === 'email_not_confirmed') {
          return res.status(403).json({
            success: false,
            error: 'Please confirm your email address before signing in.'
          });
        }
        if (isCallerError(result.error)) {
          return res.status(401).json({
            success: false,
            error: 'Invalid email or password'
          });
        }
        return authUnavailable(res);
      }
      data = result.data;
    } catch (supabaseError) {
      console.error('Supabase connection error:', supabaseError);
      return authUnavailable(res);
    }

    if (!data || !data.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: signToken(data.user),
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || email.split('@')[0],
        avatar: data.user.user_metadata?.avatar_url || null,
        bio: data.user.user_metadata?.bio || null,
        emailConfirmed: data.user.email_confirmed_at ? true : false
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Logout user
router.post('/logout', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Google OAuth callback
router.post('/google-callback', async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: 'Access token required'
      });
    }

    let user;
    try {
      // Get user info from Supabase using the access token
      const result = await supabase.auth.getUser(access_token);
      user = result.data?.user;
      if (result.error || !user) {
        console.error('Supabase user fetch error:', result.error);
        return res.status(400).json({
          success: false,
          error: 'Invalid access token'
        });
      }
    } catch (supabaseError) {
      console.error('Supabase connection error:', supabaseError);
      return authUnavailable(res);
    }

    res.json({
      success: true,
      message: 'Google OAuth successful',
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
        avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        bio: user.user_metadata?.bio || null,
        emailConfirmed: user.email_confirmed_at ? true : false
      }
    });

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Google OAuth failed'
    });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, jwtSecret());
    if (!isRealUserId(decoded.userId)) {
      throw new Error('token was issued for a mock-mode user');
    }

    res.json({
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        fullName: decoded.email.split('@')[0] // Use email prefix as fullName
      }
    });

  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

module.exports = router;
