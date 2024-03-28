#!/bin/bash
#read -p "Enter Slack Incoming Hook: " "slack_incoming_webhook"
vercel env add slack-incoming-webhook #"$slack_incoming_webhook"

#read -p "Enter Discord Webhook: " "discord_incoming_webhook"
vercel env add discord-incoming-webhook

#read -p "Enter IMGBB API Key: " "imgbb_api_key"
vercel env add imgbb-api-key #"$imgbb_api_key"

vercel deploy
