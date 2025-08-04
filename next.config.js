const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    // Exclude authentication routes from caching
    navigateFallbackDenylist: [/^\/api\/auth/],
    runtimeCaching: [
      {
        urlPattern: /^\/api\/auth/,
        handler: 'NetworkOnly', // Never cache auth requests
      }
    ]
  }
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withPWA(nextConfig)