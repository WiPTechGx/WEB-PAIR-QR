#!/bin/bash

# PGWIZ Session - Supabase Edge Functions Deployment Script

# Check if Supabase Access Token is present
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Warning: SUPABASE_ACCESS_TOKEN is not set. Skipping Edge Function deployment."
  echo "To deploy functions, set SUPABASE_ACCESS_TOKEN in your Vercel Environment Variables."
  exit 0
fi

# Set Project ID
project_id="edxiyetfcnugrmxhmvpq"

echo "=========================================="
echo "PGWIZ Session - Deploying to Supabase"
echo "=========================================="

# Sync Secrets to Supabase
echo ""
echo "Syncing secrets to Supabase..."

# Build secrets command with available env vars
secrets_cmd="npx supabase secrets set --project-ref $project_id"

if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  secrets_cmd="$secrets_cmd SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
fi

if [ -n "$MEGA_EMAIL" ]; then
  secrets_cmd="$secrets_cmd MEGA_EMAIL=$MEGA_EMAIL"
fi

if [ -n "$MEGA_PASSWORD" ]; then
  secrets_cmd="$secrets_cmd MEGA_PASSWORD=$MEGA_PASSWORD"
fi

if [ -n "$VITE_SUPABASE_URL" ]; then
  secrets_cmd="$secrets_cmd SUPABASE_URL=$VITE_SUPABASE_URL"
fi

# Execute secrets sync
$secrets_cmd
echo "✅ Secrets synced successfully."

# Deploy Supabase Edge Functions
echo ""
echo "Deploying Supabase Edge Functions..."

npx supabase functions deploy create-session --project-ref "$project_id" --no-verify-jwt
npx supabase functions deploy get-pair-code --project-ref "$project_id" --no-verify-jwt
npx supabase functions deploy session-status --project-ref "$project_id" --no-verify-jwt

echo ""
echo "=========================================="
echo "✅ Edge Functions deployed successfully!"
echo "=========================================="
