# Deployment Guide

## Production Deployment

```bash
git push production main
```

Deployment happens automatically via git post-receive hook:
1. Checkout to /var/www/tracker-build
2. npm install
3. npm run build
4. Copy dist/ to /var/www/html/tracker
5. Set file permissions

## Environment Variables

Production env vars: `/var/www/tracker-build/.env` on VPS

To update:
```bash
ssh root@94.237.37.88
nano /var/www/tracker-build/.env
# Save changes
# Redeploy: git push production main
```

## Troubleshooting

### Build fails
```bash
ssh root@94.237.37.88
cd /var/www/tracker-build
npm install
npm run build
```

### Changes not appearing
- Hard refresh browser: Ctrl+Shift+R
- Check Cloudflare cache
- Verify deployment completed successfully

### Authentication issues
- Verify Supabase project is active
- Check RLS policies are enabled
- Ensure user account exists
