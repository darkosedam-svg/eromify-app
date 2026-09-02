const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { FREE_PLAN, normalizePlan, planMeets } = require('../config/plans');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log('Auth middleware - token received:', token ? token.substring(0, 20) + '...' : 'no token');

    if (!token) {
      console.log('Auth middleware - no token provided');
      return res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
    }

    // Dev token bypass removed for security

    // Try to verify as JWT token first (for normal login)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_jwt_secret');
      console.log('Auth middleware - JWT token verified, user:', decoded.email);
      req.user = {
        id: decoded.userId,
        email: decoded.email
      };
      next();
      return;
    } catch (jwtError) {
      console.log('Auth middleware - JWT verification failed, trying Supabase...');
    }

    // If JWT fails, try Supabase token verification
    console.log('Auth middleware - verifying token with Supabase...');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('Auth middleware - Supabase verification failed:', error);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }

    console.log('Auth middleware - Supabase token verified, user:', user.email);
    req.user = {
      id: user.id,
      email: user.email
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication error' 
    });
  }
};

/**
 * Gate a route behind a minimum plan.
 *
 * Reads users.subscription_plan — the column the Stripe webhook actually
 * writes. This previously queried a `subscriptions` table that nothing in the
 * codebase ever inserts into, so every request (paying customers included)
 * fell through to "Active subscription required".
 */
const requireSubscription = (requiredPlan) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { data: user, error } = await supabase
        .from('users')
        .select('subscription_plan, subscription_billing, credits, influencer_trainings')
        .eq('id', req.user.id)
        .single();

      if (error) {
        console.error('Subscription lookup failed:', error);
        return res.status(500).json({
          success: false,
          error: 'Subscription verification error'
        });
      }

      const plan = normalizePlan(user?.subscription_plan);

      if (!planMeets(plan, requiredPlan)) {
        return res.status(403).json({
          success: false,
          error: plan === FREE_PLAN
            ? 'Active subscription required'
            : `Upgrade to the ${requiredPlan} plan to use this feature`
        });
      }

      req.subscription = {
        plan,
        billing: user?.subscription_billing ?? null,
        credits: user?.credits ?? null,
        influencerTrainings: user?.influencer_trainings ?? null
      };
      next();
    } catch (error) {
      console.error('Subscription middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Subscription verification error'
      });
    }
  };
};

module.exports = { authenticateToken, requireSubscription };

